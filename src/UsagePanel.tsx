import { useEffect, useState, type FormEvent } from "react";
import {
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { Evidence, Subscription, UsageMetric } from "../shared/types";
import { decidingEvidence, evidenceIsFresh, today } from "../shared/domain";
import { api, del, post } from "./api";
import { dateLabel, errorText } from "./format";

const METRICS: { id: UsageMetric; label: string; unit: string }[] = [
  { id: "days", label: "Active days", unit: "days" },
  { id: "uses", label: "Uses", unit: "uses" },
  { id: "quota", label: "Quota used", unit: "GB" },
  { id: "other", label: "Other", unit: "" },
];
const VALUE_LABEL = {
  personal: "Personal use",
  shared: "Shared with others",
  background: "Background value (storage, backups, access)",
};

export function evidenceMeasure(e: Evidence) {
  if (e.source === "Check-in")
    return [
      e.wouldRenew === undefined
        ? undefined
        : e.wouldRenew
          ? "Would renew"
          : "Would not renew",
      e.value ? VALUE_LABEL[e.value] : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  if (e.usage === undefined) return "";
  let unit =
    e.unit || (e.metric === "days" ? "days" : e.metric === "uses" ? "uses" : "");
  const total = e.limit ?? (e.metric === "days" ? e.days : undefined);
  const of = total ? ` of ${total}` : "";
  // Units are stored singular ("active day"), so they read as "24 of 30 active days".
  if (unit && (total ?? e.usage) !== 1 && !/s$/i.test(unit)) unit += "s";
  return `${e.usage}${of} ${unit}`.trim();
}

export function EvidenceList({
  sub,
  onRefresh,
  demo,
}: {
  sub: Subscription;
  onRefresh: () => Promise<void>;
  demo: boolean;
}) {
  const deciding = decidingEvidence(sub);
  const [confirming, setConfirming] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const items = [...sub.evidence].sort(
    (a, b) =>
      b.observedAt.localeCompare(a.observedAt) ||
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  if (!items.length)
    return (
      <div className="notice">
        No usage evidence yet. Unknown usage does not mean unused.
      </div>
    );
  return (
    <>
      <ul className="evidence-list">
        {items.map((e) => {
          const stale = !evidenceIsFresh(e);
          const isDeciding = deciding?.id === e.id;
          return (
            <li className={`evidence ${isDeciding ? "deciding" : ""}`} key={e.id}>
              <span className="evidence-icon">
                <FileText size={17} />
              </span>
              <div>
                <strong>
                  {e.source}
                  <span>{e.confidence} confidence</span>
                  {isDeciding && <em className="tag green">Deciding</em>}
                  {stale && <em className="tag gray">Older than 60 days</em>}
                  {e.source === "Browser activity" && (
                    <em className="tag gray">Partial signal</em>
                  )}
                </strong>
                {evidenceMeasure(e) && (
                  <p className="evidence-measure">{evidenceMeasure(e)}</p>
                )}
                <p>{e.summary}</p>
                <small>
                  Observed {dateLabel(e.observedAt, true)}
                  {e.days ? ` · ${e.days}-day window` : ""}
                  {demo && sub.source === "Demo" ? " · Sample data" : ""}
                </small>
              </div>
              {confirming === e.id ? (
                <span className="evidence-confirm">
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await del(
                          `/api/subscriptions/${sub.id}/evidence/${encodeURIComponent(e.id)}`,
                        );
                        await onRefresh();
                        setConfirming(null);
                      } catch (err) {
                        setError(errorText(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Delete
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setConfirming(null)}
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  className="icon-button"
                  aria-label={`Delete ${e.source} evidence from ${dateLabel(e.observedAt)}`}
                  onClick={() => setConfirming(e.id)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

export function UsagePanel({
  sub,
  demo,
  onRefresh,
  onNotify,
}: {
  sub: Subscription;
  demo: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (s: string) => void;
}) {
  return (
    <>
      <CheckIn sub={sub} onRefresh={onRefresh} onNotify={onNotify} />
      <UsageForm sub={sub} onRefresh={onRefresh} onNotify={onNotify} />
      <h3 className="detail-subheading">Evidence</h3>
      <EvidenceList sub={sub} demo={demo} onRefresh={onRefresh} />
      <AccountInspection sub={sub} onRefresh={onRefresh} onNotify={onNotify} />
      <BrowserActivityImport onRefresh={onRefresh} onNotify={onNotify} />
    </>
  );
}

function CheckIn({
  sub,
  onRefresh,
  onNotify,
}: {
  sub: Subscription;
  onRefresh: () => Promise<void>;
  onNotify: (s: string) => void;
}) {
  const [wouldRenew, setWouldRenew] = useState<boolean | null>(null),
    [value, setValue] = useState<"personal" | "shared" | "background">(
      "personal",
    ),
    [summary, setSummary] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async () => {
    if (wouldRenew === null) return;
    setBusy(true);
    setError("");
    try {
      await post(`/api/subscriptions/${sub.id}/check-in`, {
        wouldRenew,
        value,
        ...(summary.trim() ? { summary: summary.trim() } : {}),
      });
      await onRefresh();
      setWouldRenew(null);
      setSummary("");
      onNotify("Check-in saved.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="check-in" aria-label="Quick check-in">
      <h3>Would you renew {sub.name} today?</h3>
      <div className="segmented-control" role="group" aria-label="Would you renew">
        <button
          aria-pressed={wouldRenew === true}
          className={wouldRenew === true ? "active" : ""}
          onClick={() => setWouldRenew(true)}
        >
          Yes
        </button>
        <button
          aria-pressed={wouldRenew === false}
          className={wouldRenew === false ? "active" : ""}
          onClick={() => setWouldRenew(false)}
        >
          No
        </button>
      </div>
      {wouldRenew !== null && (
        <div className="check-in-more">
          <label>
            Where its value comes from
            <select
              value={value}
              onChange={(e) => setValue(e.target.value as typeof value)}
            >
              {Object.entries(VALUE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note <span className="optional">Optional</span>
            <input
              value={summary}
              maxLength={500}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Family plan, used by three people"
            />
          </label>
          <button
            className="button primary compact"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy && <Loader2 size={15} className="spin" />}Save check-in
          </button>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function UsageForm({
  sub,
  onRefresh,
  onNotify,
}: {
  sub: Subscription;
  onRefresh: () => Promise<void>;
  onNotify: (s: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [metric, setMetric] = useState<UsageMetric>("days"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const unitDefault = METRICS.find((m) => m.id === metric)?.unit ?? "";
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) =>
      f.get(k) === "" || f.get(k) === null ? undefined : Number(f.get(k));
    setBusy(true);
    setError("");
    try {
      await post(`/api/subscriptions/${sub.id}/evidence`, {
        source: "Self-reported",
        summary: String(f.get("summary")).trim(),
        observedAt: String(f.get("observedAt")),
        metric,
        unit: String(f.get("unit") || "").trim() || undefined,
        usage: num("usage"),
        limit: num("limit"),
        days: Number(f.get("days")),
      });
      await onRefresh();
      setOpen(false);
      onNotify("Usage saved.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  if (!open)
    return (
      <button className="button secondary full" onClick={() => setOpen(true)}>
        Add usage you measured
      </button>
    );
  return (
    <form className="form-grid usage-form" onSubmit={submit}>
      <label>
        What you measured
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as UsageMetric)}
        >
          {METRICS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Unit
        <input
          name="unit"
          key={metric}
          defaultValue={unitDefault}
          maxLength={30}
          placeholder="e.g. projects"
        />
      </label>
      <label>
        Amount
        <input
          type="number"
          name="usage"
          required
          min="0"
          step="any"
          placeholder={metric === "days" ? "12" : "2"}
        />
      </label>
      <label>
        {metric === "quota" ? "Plan allowance" : "Out of"}{" "}
        <span className="optional">Optional</span>
        <input type="number" name="limit" min="0.01" step="any" />
      </label>
      <label>
        Observation window
        <select name="days" defaultValue="30">
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
      </label>
      <label>
        Observed on
        <input
          type="date"
          name="observedAt"
          max={today()}
          defaultValue={today()}
          required
        />
      </label>
      <label className="span-two">
        Notes
        <textarea
          name="summary"
          required
          maxLength={2000}
          placeholder="Include mobile, offline and shared use."
        />
      </label>
      {error && (
        <div className="notice error span-two" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions span-two">
        <button
          type="button"
          className="button secondary"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <button className="button primary" disabled={busy}>
          {busy && <Loader2 className="spin" size={16} />}Save usage
        </button>
      </div>
    </form>
  );
}

type Draft = {
  summary: string;
  usage: number | null;
  limit: number | null;
  days: number | null;
  metric?: UsageMetric;
  unit?: string;
};

function AccountInspection({
  sub,
  onRefresh,
  onNotify,
}: {
  sub: Subscription;
  onRefresh: () => Promise<void>;
  onNotify: (s: string) => void;
}) {
  const [url, setUrl] = useState(""),
    [warned, setWarned] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draftId, setDraftId] = useState<string>(),
    [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    let live = true;
    api<{ liveViewUrl?: string; draft?: Draft; draftId?: string }>(
      `/api/subscriptions/${sub.id}/inspect`,
    )
      .then((r) => {
        if (!live || !r) return;
        if (r.liveViewUrl) setUrl(r.liveViewUrl);
        if (r.draft) setDraft(r.draft);
        if (r.draftId) setDraftId(r.draftId);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sub.id]);

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
  const close = () =>
    run(async () => {
      await post("/api/inspect/close");
      setUrl("");
      setDraft(null);
      setDraftId(undefined);
      setWarned(false);
    });
  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  return (
    <section className="account-inspection">
      <h3>Read usage from your account page</h3>
      {!url && !draft && !warned && (
        <>
          <p>
            Sign in yourself in a private cloud browser, open a usage page, and
            review what Folio reads before saving.
          </p>
          <button
            className="button secondary"
            onClick={() => setWarned(true)}
          >
            <Globe size={16} />
            Open account browser
          </button>
        </>
      )}
      {!url && !draft && warned && (
        <div className="notice warning" role="note">
          <ShieldAlert size={18} />
          <div>
            <p>
              This opens a browser hosted by Kernel, a third-party service.
              Anything you type there, including your password, goes to that
              browser. Folio saves only the evidence you approve, never
              screenshots.
            </p>
            <div className="inline-actions">
              <button
                className="button primary compact"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await post<{ liveViewUrl: string }>(
                      `/api/subscriptions/${sub.id}/inspect/start`,
                    );
                    setUrl(r.liveViewUrl);
                  })
                }
              >
                {busy && <Loader2 className="spin" size={15} />}Continue
              </button>
              <button className="text-button" onClick={() => setWarned(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      {url && (
        <div className="inline-actions">
          <a
            className="button primary compact"
            href={url}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open private browser <ExternalLink size={14} />
          </a>
          <button
            className="button secondary compact"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await post<Draft & { draftId?: string }>(
                  `/api/subscriptions/${sub.id}/inspect/capture`,
                );
                const { draftId: id, ...rest } = r;
                setDraft(rest);
                setDraftId(id);
              })
            }
          >
            {busy ? <Loader2 className="spin" size={15} /> : <FileText size={15} />}
            Read current page
          </button>
          <button className="text-button" disabled={busy} onClick={() => void close()}>
            Close session
          </button>
        </div>
      )}
      {draft && (
        <div className="inspection-draft">
          <p className="small-note">
            Review and correct before saving. Nothing is stored until you save.
          </p>
          <div className="form-grid">
            <label className="span-two">
              Summary
              <textarea
                value={draft.summary}
                maxLength={2000}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              />
            </label>
            <label>
              Amount used
              <input
                type="number"
                min="0"
                step="any"
                value={draft.usage ?? ""}
                placeholder="Not found"
                onChange={(e) =>
                  setDraft({ ...draft, usage: numOrNull(e.target.value) })
                }
              />
            </label>
            <label>
              Allowance
              <input
                type="number"
                min="0.01"
                step="any"
                value={draft.limit ?? ""}
                placeholder="Not found"
                onChange={(e) =>
                  setDraft({ ...draft, limit: numOrNull(e.target.value) })
                }
              />
            </label>
            <label>
              Measured as
              <select
                value={draft.metric ?? "other"}
                onChange={(e) =>
                  setDraft({ ...draft, metric: e.target.value as UsageMetric })
                }
              >
                {METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Window (days)
              <input
                type="number"
                min="1"
                max="365"
                step="1"
                value={draft.days ?? ""}
                placeholder="Unknown"
                onChange={(e) =>
                  setDraft({ ...draft, days: numOrNull(e.target.value) })
                }
              />
            </label>
            <label className="span-two">
              Unit <span className="optional">Optional</span>
              <input
                value={draft.unit ?? ""}
                maxLength={30}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
            </label>
          </div>
          <div className="inline-actions">
            <button
              className="button primary compact"
              disabled={busy || !draft.summary.trim()}
              onClick={() =>
                void run(async () => {
                  await post(`/api/subscriptions/${sub.id}/inspect/save`, {
                    draftId,
                    summary: draft.summary.trim(),
                    usage: draft.usage,
                    limit: draft.limit,
                    days: draft.days,
                    metric: draft.metric,
                    unit: draft.unit?.trim() || undefined,
                  });
                  await onRefresh();
                  setDraft(null);
                  setDraftId(undefined);
                  setUrl("");
                  setWarned(false);
                  onNotify("Account evidence saved.");
                })
              }
            >
              Save this evidence
            </button>
            <button className="text-button" disabled={busy} onClick={() => void close()}>
              Discard
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function BrowserActivityImport({
  onRefresh,
  onNotify,
}: {
  onRefresh: () => Promise<void>;
  onNotify: (s: string) => void;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="browser-import">
      <summary>Import browser companion summary</summary>
      <p className="muted">
        The Folio extension counts visits to the domains you list, locally. It
        is a partial signal: mobile, offline and shared use are not seen.{" "}
        <a href="/folio-extension.zip" download>
          Download extension
        </a>
      </p>
      <label className="upload-zone compact">
        <span>Choose the .json summary</span>
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
            e.target.value = "";
          }}
        />
      </label>
      <textarea
        className="import-textarea short"
        aria-label="Browser activity summary JSON"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"observedAt":"…","days":30,"visits":[…]}'
      />
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <button
        className="button secondary compact"
        disabled={busy || !text.trim()}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            let body: unknown;
            try {
              body = JSON.parse(text);
            } catch {
              throw new Error("That isn’t valid JSON from the Folio extension.");
            }
            const r = await post<{ count: number }>("/api/import/browser", body);
            await onRefresh();
            setText("");
            onNotify(
              r.count
                ? `Browser visits added to ${r.count} subscription${r.count === 1 ? "" : "s"}.`
                : "No listed domains matched your subscriptions.",
            );
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="spin" size={15} />}Import visits
      </button>
    </details>
  );
}
