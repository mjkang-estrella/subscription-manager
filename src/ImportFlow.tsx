import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  FileText,
  Loader2,
  Mail,
  Upload,
} from "lucide-react";
import type { Integration, Subscription } from "../shared/types";
import type {
  ImportCandidate,
  ImportMapping,
  ImportReport,
} from "../shared/discovery";
import { money } from "../shared/domain";
import { LONG_REQUEST, post } from "./api";
import { Logo, Modal } from "./components";
import { CATEGORIES, dateLabel, download, errorText, per } from "./format";

type Kind = "csv" | "email";
type Inspection = {
  headers: string[];
  sample: Record<string, string>[];
  mapping: ImportMapping;
};
type Confirmed = { count: number; merged?: number; skipped?: number };
type MergeChoice = Record<string, string>; // candidate id -> existing id

const MAX_CSV = 1_500_000;
const MAX_RECEIPT = 500_000;
const MAX_RECEIPTS = 20;
const MAX_RECEIPT_TOTAL = 2_000_000;
type Reviewed = NonNullable<ImportCandidate["reviewedFields"]>[number];

/** Problems that would make the server reject or silently skip a selected candidate. */
export function candidateProblems(c: ImportCandidate): string[] {
  const p: string[] = [];
  const reviewed = new Set(c.reviewedFields ?? []);
  if (!c.name.trim()) p.push("a name");
  if (!c.plan.trim()) p.push("a plan");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.nextBilling)) p.push("a next date");
  if (!(c.price >= 0)) p.push("an amount");
  if (c.requiresReview?.includes("price") && !c.price && !reviewed.has("price"))
    p.push("its amount");
  if (c.requiresReview?.includes("currency") && !reviewed.has("currency"))
    p.push("USD confirmed");
  if (c.requiresReview?.includes("cycle") && !reviewed.has("cycle"))
    p.push("a confirmed billing cycle");
  return p;
}
/** Many banks export charges as negative amounts; preselect that when the sample says so. */
export function suggestedSign(i: {
  sample: Record<string, string>[];
  mapping: ImportMapping;
}): "positive" | "negative" {
  const col = i.mapping.amount;
  if (!col || i.mapping.debit) return "positive";
  const values = i.sample
    .map((row) =>
      Number(
        (row[col] ?? "")
          .replace(/[^0-9.()-]/g, "")
          .replace(/^\((.*)\)$/, "-$1"),
      ),
    )
    .filter((n) => Number.isFinite(n) && n !== 0);
  const negative = values.filter((n) => n < 0).length;
  return values.length && negative > values.length / 2
    ? "negative"
    : "positive";
}
const FIELDS: { key: keyof ImportMapping; label: string; hint?: string }[] = [
  { key: "merchant", label: "Merchant or description *" },
  { key: "date", label: "Date *" },
  { key: "amount", label: "Amount", hint: "Or map debit and credit" },
  { key: "debit", label: "Debit" },
  { key: "credit", label: "Credit" },
  { key: "currency", label: "Currency" },
  { key: "cycle", label: "Billing cycle" },
  { key: "plan", label: "Plan" },
  { key: "domain", label: "Website" },
  { key: "category", label: "Category" },
];

export function AddDataChooser({
  onChoose,
  onClose,
}: {
  onChoose: (choice: "csv" | "email" | "manual") => void;
  onClose: () => void;
}) {
  const options = [
    {
      id: "csv" as const,
      icon: <FileText size={21} />,
      title: "Card statement",
      text: "CSV from your bank or card. Review before anything is saved.",
    },
    {
      id: "email" as const,
      icon: <Mail size={21} />,
      title: "Receipt emails",
      text: ".eml files or pasted receipts. Several at once.",
    },
    {
      id: "manual" as const,
      icon: <Upload size={21} />,
      title: "Add one manually",
      text: "Name, plan, price and next payment.",
    },
  ];
  return (
    <Modal title="Add data" onClose={onClose}>
      <div className="modal-body">
        <div className="choice-list">
          {options.map((o) => (
            <button key={o.id} onClick={() => onChoose(o.id)}>
              <span className="choice-icon">{o.icon}</span>
              <span>
                <strong>{o.title}</strong>
                <small>{o.text}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="small-note">
          Usage from the browser extension is added in a subscription’s Usage
          tab.
        </p>
      </div>
    </Modal>
  );
}

export function ImportFlow({
  kind,
  subscriptions,
  integrations,
  onClose,
  onDone,
}: {
  kind: Kind;
  subscriptions: Subscription[];
  integrations: Integration[];
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [step, setStep] = useState<"source" | "map" | "review">("source"),
    [text, setText] = useState(""),
    [files, setFiles] = useState<{ name: string; text: string }[]>([]),
    [inspection, setInspection] = useState<Inspection | null>(null),
    [mapping, setMapping] = useState<ImportMapping>({}),
    [dateOrder, setDateOrder] = useState<"MDY" | "DMY" | "YMD">("MDY"),
    [chargeSign, setChargeSign] = useState<"positive" | "negative">("positive"),
    [candidates, setCandidates] = useState<ImportCandidate[]>([]),
    [report, setReport] = useState<ImportReport | null>(null),
    [merge, setMerge] = useState<MergeChoice>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const gmail = integrations.find((i) => i.id === "gmail");

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const readFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const chosen = Array.from(list);
    const limit = kind === "csv" ? MAX_CSV : MAX_RECEIPT;
    const big = chosen.find((f) => f.size > limit);
    if (big) {
      setError(
        `${big.name} is over ${kind === "csv" ? "1.5 MB" : "500 KB"}. Choose a smaller file.`,
      );
      return;
    }
    const read = await Promise.all(
      chosen.map(async (f) => ({ name: f.name, text: await f.text() })),
    );
    if (kind === "csv") {
      setText(read[0].text);
      setFiles([]);
      setError("");
      return;
    }
    const next = [...files, ...read];
    if (next.length > MAX_RECEIPTS) {
      setError(`Choose up to ${MAX_RECEIPTS} receipt files at a time.`);
      return;
    }
    if (next.reduce((a, f) => a + f.text.length, 0) > MAX_RECEIPT_TOTAL) {
      setError("Those receipts total more than 2 MB. Import them in batches.");
      return;
    }
    setFiles(next);
    setError("");
  };

  const showReview = (r: {
    candidates: ImportCandidate[];
    report?: ImportReport;
  }) => {
    setCandidates(
      r.candidates.map((c) => ({
        ...c,
        selected: c.selected ?? c.confidence !== "possible",
      })),
    );
    setReport(r.report ?? null);
    setMerge({});
    setStep("review");
  };

  const inspect = () =>
    run(async () => {
      const r = await post<Inspection>("/api/import/inspect", { text });
      setInspection(r);
      setMapping(r.mapping);
      setChargeSign(suggestedSign(r));
      setStep("map");
    });

  const parse = () =>
    run(async () => {
      const body =
        kind === "csv"
          ? { type: kind, text, mapping, dateOrder, chargeSign }
          : {
              type: kind,
              ...(files.length ? { files } : {}),
              ...(text.trim() ? { text } : {}),
            };
      showReview(
        await post<{ candidates: ImportCandidate[]; report?: ImportReport }>(
          "/api/import/parse",
          body,
          kind === "email" ? LONG_REQUEST() : {},
        ),
      );
    });

  const fromGmail = () =>
    run(async () =>
      showReview(
        await post<{ candidates: ImportCandidate[]; report?: ImportReport }>(
          "/api/gmail/import",
          {},
          LONG_REQUEST(),
        ),
      ),
    );

  const selected = candidates.filter((c) => c.selected);
  const problems = useMemo(
    () =>
      selected.flatMap((c) => {
        const p = candidateProblems(c);
        return p.length
          ? [`${c.name || "A candidate"} needs ${p.join(", ")}.`]
          : [];
      }),
    [selected],
  );
  const skippedMatches = selected.filter(
    (c) => c.matchId && (!merge[c.id] || merge[c.id] === "new"),
  ).length;

  const confirm = () =>
    run(async () => {
      const matches: Record<string, string> = {};
      for (const c of selected)
        if (merge[c.id] && merge[c.id] !== "new") matches[c.id] = merge[c.id];
      const r = await post<Confirmed>("/api/import/confirm", {
        subscriptions: selected,
        source: kind === "csv" ? "CSV" : "Email",
        matches,
      });
      const parts = [`${r.count} added`];
      if (r.merged) parts.push(`${r.merged} merged`);
      if (r.skipped) parts.push(`${r.skipped} skipped as already tracked`);
      await onDone(`Import saved: ${parts.join(", ")}.`);
    });

  const update = (id: string, patch: Partial<ImportCandidate>) =>
    setCandidates((all) =>
      all.map((c) => {
        if (c.id !== id) return c;
        const reviewed = new Set<Reviewed>(c.reviewedFields ?? []);
        // Editing a field the importer couldn't establish counts as reviewing it.
        for (const f of ["price", "cycle", "nextBilling"] as const)
          if (f in patch && patch[f] !== c[f]) reviewed.add(f);
        if (patch.reviewedFields) return { ...c, ...patch };
        return { ...c, ...patch, reviewedFields: [...reviewed] };
      }),
    );

  const mappedOk =
    Boolean(mapping.merchant && mapping.date) &&
    Boolean(mapping.amount || mapping.debit || mapping.credit);
  const title =
    step === "review"
      ? "Review what we found"
      : kind === "csv"
        ? step === "map"
          ? "Match your columns"
          : "Import a card statement"
        : "Import receipts";

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="modal-body import-flow">
        {step === "source" && (
          <>
            <label className="upload-zone">
              <Upload size={25} />
              <strong>
                {kind === "csv" ? "Choose a CSV file" : "Choose receipt files"},
                or paste below
              </strong>
              <span>
                {kind === "csv"
                  ? ".csv · up to 1.5 MB"
                  : ".eml, .html or .txt · several files · 1.5 MB each"}
              </span>
              <input
                type="file"
                multiple={kind === "email"}
                accept={
                  kind === "csv" ? ".csv,text/csv" : ".eml,.txt,.html,.htm"
                }
                onChange={(e) => {
                  void readFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {files.length > 0 && (
              <ul className="file-list" aria-label="Selected receipt files">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <FileText size={15} />
                    <span>{f.name}</span>
                    <button
                      className="text-button"
                      onClick={() => setFiles(files.filter((_, n) => n !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              className="import-textarea"
              aria-label={kind === "csv" ? "Statement CSV" : "Receipt text"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                kind === "csv"
                  ? "Date,Description,Amount\n09/09/2026,SPOTIFY USA,11.99"
                  : "Paste a receipt here…"
              }
            />
            {kind === "csv" ? (
              <button
                className="text-button"
                onClick={() =>
                  download(
                    "folio-import-template.csv",
                    "date,merchant,amount,currency\n2026-09-01,Example Service,12.99,USD\n2026-10-01,Example Service,12.99,USD\n",
                  )
                }
              >
                Download a CSV template
              </button>
            ) : (
              <div className="inline-status">
                {gmail?.configured ? (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void fromGmail()}
                  >
                    Import from connected Gmail
                  </button>
                ) : (
                  <span className="muted">
                    Gmail import is unavailable until Google credentials are
                    configured. Files and pasted receipts work now.
                  </span>
                )}
              </div>
            )}
            {kind === "email" && (
              <p className="small-note">
                Email content is read as data. Instructions inside receipts are
                never followed.
              </p>
            )}
          </>
        )}

        {step === "map" && inspection && (
          <>
            <div className="mapping-grid">
              {FIELDS.map((f) => (
                <label key={f.key}>
                  {f.label}
                  <select
                    value={mapping[f.key] ?? ""}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        [f.key]: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Not in file</option>
                    {inspection.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {f.hint && <small>{f.hint}</small>}
                </label>
              ))}
            </div>
            <div className="mapping-options">
              <fieldset>
                <legend>Dates like 03/04/2026 mean</legend>
                {(
                  [
                    ["MDY", "Month / day / year"],
                    ["DMY", "Day / month / year"],
                    ["YMD", "Year / month / day"],
                  ] as const
                ).map(([v, l]) => (
                  <label className="radio" key={v}>
                    <input
                      type="radio"
                      name="dateOrder"
                      checked={dateOrder === v}
                      onChange={() => setDateOrder(v)}
                    />
                    {l}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Charges in the amount column are</legend>
                <label className="radio">
                  <input
                    type="radio"
                    name="sign"
                    checked={chargeSign === "positive"}
                    onChange={() => setChargeSign("positive")}
                  />
                  Positive (refunds negative)
                </label>
                <label className="radio">
                  <input
                    type="radio"
                    name="sign"
                    checked={chargeSign === "negative"}
                    onChange={() => setChargeSign("negative")}
                  />
                  Negative (refunds positive)
                </label>
              </fieldset>
            </div>
            {inspection.sample.length > 0 && (
              <div
                className="sample-table"
                role="region"
                aria-label="First rows of your file"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      {inspection.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inspection.sample.slice(0, 4).map((row, i) => (
                      <tr key={i}>
                        {inspection.headers.map((h) => (
                          <td key={h}>{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!mappedOk && (
              <p className="small-note">
                Map a merchant, a date, and an amount (or debit/credit) column.
              </p>
            )}
          </>
        )}

        {step === "review" && (
          <>
            {report && <ImportReportView report={report} />}
            <CandidateGroup
              title="Likely subscriptions"
              note="Repeated charges at a regular interval."
              items={candidates.filter((c) => c.confidence !== "possible")}
              subscriptions={subscriptions}
              merge={merge}
              setMerge={setMerge}
              update={update}
            />
            <CandidateGroup
              title="Possible"
              note="A single charge or an irregular pattern. Not selected unless you choose it."
              items={candidates.filter((c) => c.confidence === "possible")}
              subscriptions={subscriptions}
              merge={merge}
              setMerge={setMerge}
              update={update}
            />
            {!candidates.length && (
              <div className="notice">
                Nothing recurring found. Check the column mapping or try another
                file.
              </div>
            )}
            {skippedMatches > 0 && (
              <p className="small-note">
                {skippedMatches} selected item
                {skippedMatches === 1 ? " matches" : "s match"} something you
                already track and will be skipped unless you choose to merge.
              </p>
            )}
            {problems.length > 0 && (
              <ul className="notice warning problem-list">
                {problems.slice(0, 4).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() =>
              step === "source"
                ? onClose()
                : setStep(
                    step === "review" && kind === "csv" ? "map" : "source",
                  )
            }
          >
            {step === "source" ? (
              "Cancel"
            ) : (
              <>
                <ArrowLeft size={16} /> Back
              </>
            )}
          </button>
          {step === "source" && (
            <button
              className="button primary"
              disabled={busy || (!text.trim() && !files.length)}
              onClick={() => void (kind === "csv" ? inspect() : parse())}
            >
              {busy && <Loader2 size={16} className="spin" />}
              {kind === "csv" ? "Continue" : "Find subscriptions"}
            </button>
          )}
          {step === "map" && (
            <button
              className="button primary"
              disabled={busy || !mappedOk}
              onClick={() => void parse()}
            >
              {busy && <Loader2 size={16} className="spin" />}
              Find subscriptions
            </button>
          )}
          {step === "review" && (
            <button
              className="button primary"
              disabled={busy || !selected.length || problems.length > 0}
              onClick={() => void confirm()}
            >
              {busy && <Loader2 size={16} className="spin" />}
              Save {selected.length} selected
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function ImportReportView({ report }: { report: ImportReport }) {
  const reasons = Object.entries(report.skippedByReason ?? {});
  const currencies = Object.entries(report.nonUsdByCurrency ?? {});
  const skippedTotal = reasons.reduce((a, [, n]) => a + n, 0);
  return (
    <section className="import-report" aria-label="Import summary">
      <div className="report-figures">
        <span>
          <strong>{report.rowsRead}</strong> rows read
        </span>
        <span>
          <strong>{report.rowsAccepted}</strong> charges used
        </span>
        <span>
          <strong>{skippedTotal}</strong> skipped
        </span>
      </div>
      {(reasons.length > 0 || currencies.length > 0) && (
        <ul className="report-reasons">
          {reasons.map(([reason, n]) => (
            <li key={reason}>
              {n} × {reason}
            </li>
          ))}
          {currencies.map(([cur, n]) => (
            <li key={cur}>
              {n} × {cur} charge{n === 1 ? "" : "s"} not imported (USD only,
              never converted)
            </li>
          ))}
        </ul>
      )}
      {report.truncated && (
        <p className="report-warning">
          <CircleAlert size={15} /> The file was longer than the import limit;
          later rows were not read.
        </p>
      )}
      {report.candidatesOmitted > 0 && (
        <p className="report-warning">
          <CircleAlert size={15} /> Showing the first {report.candidateLimit}{" "}
          candidates; {report.candidatesOmitted} more were not listed.
        </p>
      )}
      {report.warnings?.map((w) => (
        <p className="report-warning" key={w}>
          <CircleAlert size={15} /> {w}
        </p>
      ))}
      {report.skipped?.length > 0 && (
        <details>
          <summary>Skipped rows</summary>
          <ul className="skipped-rows">
            {report.skipped.slice(0, 100).map((s, i) => (
              <li key={i}>
                {s.file ? `${s.file} · ` : ""}Row {s.row}: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CandidateGroup({
  title,
  note,
  items,
  subscriptions,
  merge,
  setMerge,
  update,
}: {
  title: string;
  note: string;
  items: ImportCandidate[];
  subscriptions: Subscription[];
  merge: MergeChoice;
  setMerge: (m: MergeChoice) => void;
  update: (id: string, patch: Partial<ImportCandidate>) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="candidate-group">
      <header>
        <h3>
          {title} <span className="count-pill">{items.length}</span>
        </h3>
        <p className="muted">{note}</p>
      </header>
      {items.map((c) => (
        <CandidateCard
          key={c.id}
          c={c}
          subscriptions={subscriptions}
          choice={merge[c.id]}
          onChoice={(v) => setMerge({ ...merge, [c.id]: v })}
          update={(p) => update(c.id, p)}
        />
      ))}
    </section>
  );
}

function CandidateCard({
  c,
  subscriptions,
  choice,
  onChoice,
  update,
}: {
  c: ImportCandidate;
  subscriptions: Subscription[];
  choice?: string;
  onChoice: (v: string) => void;
  update: (p: Partial<ImportCandidate>) => void;
}) {
  const [open, setOpen] = useState(Boolean(c.requiresReview?.length));
  const match = subscriptions.find((s) => s.id === c.matchId);
  const inferred = new Set(c.inferredFields ?? []);
  const flag = (field: string) =>
    inferred.has(field) ? <span className="inferred">Inferred</span> : null;
  const charges = [...(c.charges ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const mergeTarget =
    choice && choice !== "new"
      ? subscriptions.find((s) => s.id === choice)
      : undefined;
  return (
    <article className={`candidate ${c.selected ? "is-selected" : ""}`}>
      <div className="candidate-top">
        <label className="candidate-check">
          <input
            type="checkbox"
            checked={c.selected}
            onChange={(e) => update({ selected: e.target.checked })}
            aria-label={`Include ${c.name}`}
          />
        </label>
        <Logo sub={c} small />
        <div className="candidate-title">
          <strong>{c.name || "Unnamed merchant"}</strong>
          <small>{c.reason}</small>
        </div>
        <div className="candidate-amount">
          <strong>{money(c.price)}</strong>
          <small>
            {c.requiresReview?.includes("cycle") &&
            !c.reviewedFields?.includes("cycle")
              ? "Cycle unconfirmed"
              : `/ ${per(c.cycle)}`}
          </small>
        </div>
      </div>
      {c.requiresReview && c.requiresReview.length > 0 && (
        <ul className="review-flags" aria-label="Needs review">
          {c.requiresReview.map((r) => (
            <li key={r}>
              <CircleAlert size={13} />
              {r}
            </li>
          ))}
        </ul>
      )}
      {c.requiresReview?.includes("currency") && (
        <label className="checkbox review-confirm">
          <input
            type="checkbox"
            checked={c.reviewedFields?.includes("currency") ?? false}
            onChange={(e) => {
              const rest = (c.reviewedFields ?? []).filter(
                (f) => f !== "currency",
              );
              update({
                reviewedFields: e.target.checked ? [...rest, "currency"] : rest,
              });
            }}
          />
          This receipt was charged in US dollars
        </label>
      )}
      {c.requiresReview?.includes("price") && (
        <label className="checkbox review-confirm">
          <input
            type="checkbox"
            checked={c.reviewedFields?.includes("price") ?? false}
            onChange={(e) => {
              const rest = (c.reviewedFields ?? []).filter(
                (f) => f !== "price",
              );
              update({
                reviewedFields: e.target.checked ? [...rest, "price"] : rest,
              });
            }}
          />
          The amount {money(c.price)} is correct
        </label>
      )}
      {c.selected && (match || subscriptions.length > 0) && (
        <label className="merge-choice">
          {match
            ? `Looks like ${match.name} (${money(match.price)} / ${per(match.cycle)}) you already track`
            : "Save as"}
          <select
            value={choice ?? ""}
            onChange={(e) => onChoice(e.target.value)}
            aria-label={`How to save ${c.name}`}
          >
            {match ? (
              <option value="">Skip, already tracked</option>
            ) : (
              <option value="">New subscription</option>
            )}
            {match && (
              <option value={match.id}>Merge charges into {match.name}</option>
            )}
            {subscriptions
              .filter((s) => s.id !== match?.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  Merge into {s.name}
                </option>
              ))}
          </select>
          {mergeTarget && (
            <small>
              Charge history is added to {mergeTarget.name}.
              {Math.abs(mergeTarget.price - c.price) >= 0.01 &&
                ` Price differs (${money(mergeTarget.price)} → ${money(c.price)}); it will be flagged.`}
            </small>
          )}
        </label>
      )}
      <button
        className="text-button candidate-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={15} className={open ? "flip" : ""} />
        {open ? "Hide details" : "Edit details and charges"}
      </button>
      {open && (
        <div className="candidate-body">
          <div className="form-grid">
            <label>
              <span>Name {flag("name")}</span>
              <input
                value={c.name}
                maxLength={100}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label>
              <span>Plan {flag("plan")}</span>
              <input
                value={c.plan}
                maxLength={100}
                onChange={(e) => update({ plan: e.target.value })}
              />
            </label>
            <label>
              <span>Website {flag("domain")}</span>
              <input
                value={c.domain}
                maxLength={160}
                placeholder="Leave blank if unsure"
                onChange={(e) => update({ domain: e.target.value })}
              />
            </label>
            <label>
              <span>Category {flag("category")}</span>
              <select
                value={c.category}
                onChange={(e) =>
                  update({
                    category: e.target.value as ImportCandidate["category"],
                  })
                }
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Amount (USD) {flag("price")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={Number.isFinite(c.price) ? c.price : ""}
                onChange={(e) => update({ price: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Cycle {flag("cycle")}</span>
              <select
                value={
                  c.requiresReview?.includes("cycle") &&
                  !c.reviewedFields?.includes("cycle")
                    ? ""
                    : c.cycle
                }
                onChange={(e) =>
                  update({ cycle: e.target.value as ImportCandidate["cycle"] })
                }
              >
                <option value="" disabled>
                  Choose billing cycle
                </option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label className="span-two">
              <span>Next payment {flag("nextBilling")}</span>
              <input
                type="date"
                value={c.nextBilling}
                onChange={(e) => update({ nextBilling: e.target.value })}
              />
            </label>
          </div>
          {c.sourceExcerpt && (
            <blockquote className="source-excerpt">
              {c.sourceExcerpt}
            </blockquote>
          )}
          {charges.length > 0 && (
            <div className="charge-history">
              <h4>Charges found</h4>
              <ul>
                {charges.slice(0, 24).map((ch) => (
                  <li key={ch.id} className={ch.amount < 0 ? "refund" : ""}>
                    <span>{dateLabel(ch.date, true)}</span>
                    <span className="charge-desc">{ch.description}</span>
                    <strong>
                      {ch.amount < 0 ? "Refund " : ""}
                      {money(Math.abs(ch.amount))}
                    </strong>
                  </li>
                ))}
              </ul>
              {charges.length > 24 && (
                <small>{charges.length - 24} earlier charges not shown.</small>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
