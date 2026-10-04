import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  Loader2,
  LogOut,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import type {
  Action,
  ActionKind,
  RecordedOutcome,
  Subscription,
  Workspace,
} from "../shared/types";
import { money, monthly, nextRenewal, today } from "../shared/domain";
import { post } from "./api";
import { actionNames, dateLabel, errorText, per } from "./format";
import {
  actionOptions,
  defaultEffectiveDate,
  merchantSite,
  type ActionOption,
} from "./model";

type OutcomeInput = {
  kind: "cancel" | "plan";
  effectiveDate: string;
  plan?: string;
  price?: number;
  cycle?: "monthly" | "yearly";
  nextBilling?: string;
  note?: string;
};

export function ChangePanel({
  sub,
  workspace,
  onWorkspace,
  onAction,
  onEdit,
}: {
  sub: Subscription;
  workspace: Workspace;
  onWorkspace: (ws: Workspace) => void;
  onAction: (a: Action) => void;
  onEdit: () => void;
}) {
  const outcomes = (workspace.outcomes ?? []).filter(
    (o) => o.subscriptionId === sub.id,
  );
  const [correcting, setCorrecting] = useState<RecordedOutcome | null>(null);
  const [recording, setRecording] = useState(false);
  const site = merchantSite(sub);
  // Sample subscriptions only change through controlled tests; the server rejects manual outcomes for them.
  if (sub.source === "Demo")
    return (
      <>
        <ControlledTests sub={sub} workspace={workspace} onAction={onAction} />
        {outcomes.length > 0 && (
          <section>
            <h3 className="detail-subheading">Demo ledger</h3>
            <OutcomeHistory outcomes={outcomes} onCorrect={() => undefined} />
          </section>
        )}
      </>
    );
  return (
    <>
      <section className="follow-through">
        <h3>Changed it yourself?</h3>
        <p className="muted">
          Make the change on {sub.name}’s site, then record it here. Folio never
          changes your real account.
        </p>
        {site ? (
          <a
            className="button secondary compact"
            href={site}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open {site.replace(/^https:\/\//, "")} <ExternalLink size={14} />
          </a>
        ) : (
          <p className="small-note">
            No merchant website saved.{" "}
            <button className="text-button inline" onClick={onEdit}>
              Add the site you use
            </button>{" "}
            to get a direct link.
          </p>
        )}
        {recording || correcting ? (
          <OutcomeForm
            key={correcting?.id ?? "new"}
            sub={sub}
            initial={correcting}
            baseline={
              outcomes.filter((o) => o.source === "manual").at(-1)?.before ??
              sub
            }
            onCancel={() => {
              setRecording(false);
              setCorrecting(null);
            }}
            onSaved={(ws) => {
              onWorkspace(ws);
              setRecording(false);
              setCorrecting(null);
            }}
          />
        ) : (
          <button
            className="button primary full"
            onClick={() => setRecording(true)}
          >
            Record a change I made
          </button>
        )}
        {outcomes.length > 0 && (
          <OutcomeHistory
            outcomes={outcomes}
            onCorrect={(o) => {
              setRecording(false);
              setCorrecting(o);
            }}
          />
        )}
      </section>
      <ControlledTests sub={sub} workspace={workspace} onAction={onAction} />
    </>
  );
}

function OutcomeHistory({
  outcomes,
  onCorrect,
}: {
  outcomes: RecordedOutcome[];
  onCorrect: (o: RecordedOutcome) => void;
}) {
  return (
    <ul className="outcome-list" aria-label="Recorded changes">
      {outcomes.map((o, i) => (
        <li key={o.id}>
          <div>
            <strong>
              {o.kind === "cancel" ? "Cancellation" : "Plan change"}
              {o.source === "demo" && <em className="tag gray">Demo ledger</em>}
            </strong>
            <small>
              {o.before.plan} {money(o.before.price)}/{per(o.before.cycle)}
              {" → "}
              {o.kind === "cancel"
                ? `ends ${dateLabel(o.effectiveDate, true)}`
                : `${o.after.plan} ${money(o.after.price)}/${per(o.after.cycle)} from ${dateLabel(o.effectiveDate, true)}`}
            </small>
            <small>
              {money(o.monthlyReduction)} / month{" "}
              {o.source === "demo"
                ? "demo reduction"
                : o.effectiveDate > today()
                  ? "projected reduction"
                  : "recorded reduction"}{" "}
              · recorded {dateLabel(o.recordedAt.slice(0, 10))}
            </small>
          </div>
          {o.source === "manual" &&
            i === outcomes.findIndex((x) => x.source === "manual") && (
              <button className="text-button" onClick={() => onCorrect(o)}>
                Correct
              </button>
            )}
        </li>
      ))}
    </ul>
  );
}

function OutcomeForm({
  sub,
  initial,
  baseline,
  onCancel,
  onSaved,
}: {
  sub: Subscription;
  initial: RecordedOutcome | null;
  baseline: Pick<Subscription, "price" | "cycle" | "status">;
  onCancel: () => void;
  onSaved: (ws: Workspace) => void;
}) {
  const renewal = nextRenewal(sub) ?? today();
  const [kind, setKind] = useState<"cancel" | "plan">(
      initial?.kind ?? "cancel",
    ),
    [effectiveDate, setEffectiveDate] = useState(
      initial?.effectiveDate ?? renewal,
    ),
    [plan, setPlan] = useState(initial?.after.plan ?? sub.plan),
    [price, setPrice] = useState(String(initial?.after.price ?? sub.price)),
    [cycle, setCycle] = useState<"monthly" | "yearly">(
      initial?.after.cycle ?? sub.cycle,
    ),
    [nextBilling, setNextBilling] = useState(
      initial?.after.nextBilling ?? renewal,
    ),
    [note, setNote] = useState(initial?.note ?? ""),
    [confirmation, setConfirmation] = useState(""),
    [suggestion, setSuggestion] = useState<{
      endDate: string | null;
      summary: string;
    } | null>(null),
    [attested, setAttested] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  const after =
    kind === "cancel" ? 0 : monthly({ price: Number(price) || 0, cycle });
  const reduction =
    Math.round(
      ((baseline.status === "cancelled" || baseline.status === "cancel_pending"
        ? 0
        : monthly(baseline)) -
        after) *
        100,
    ) / 100;

  const suggest = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await post<{ endDate: string | null; summary: string }>(
        "/api/confirmation/parse",
        { text: confirmation },
      );
      setSuggestion(r);
      if (r.endDate) setEffectiveDate(r.endDate);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const input: OutcomeInput =
      kind === "cancel"
        ? { kind, effectiveDate }
        : {
            kind,
            effectiveDate,
            plan: plan.trim(),
            price: Number(price),
            cycle,
            nextBilling,
          };
    if (note.trim()) input.note = note.trim();
    try {
      onSaved(
        await post<Workspace>(`/api/subscriptions/${sub.id}/outcomes`, {
          ...input,
          attested: true,
        }),
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form-grid outcome-form" onSubmit={submit}>
      <div
        className="segmented-control span-two"
        role="group"
        aria-label="Change type"
      >
        <button
          type="button"
          aria-pressed={kind === "cancel"}
          className={kind === "cancel" ? "active" : ""}
          onClick={() => setKind("cancel")}
        >
          I cancelled
        </button>
        <button
          type="button"
          aria-pressed={kind === "plan"}
          className={kind === "plan" ? "active" : ""}
          onClick={() => setKind("plan")}
        >
          I changed plan or price
        </button>
      </div>
      <label className="span-two">
        Confirmation text <span className="optional">Optional</span>
        <textarea
          maxLength={5000}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Paste the merchant’s confirmation to suggest the date"
        />
      </label>
      {confirmation.trim() && (
        <div className="span-two inline-actions">
          <button
            type="button"
            className="button secondary compact"
            disabled={busy}
            onClick={() => void suggest()}
          >
            {busy && <Loader2 className="spin" size={15} />}Suggest date from
            text
          </button>
        </div>
      )}
      {suggestion && (
        <p className="notice span-two" role="status">
          {suggestion.endDate
            ? `Suggested ${dateLabel(suggestion.endDate, true)}. Check it below. `
            : "No date found. Enter it below. "}
          {suggestion.summary}
        </p>
      )}
      <label className={kind === "cancel" ? "span-two" : ""}>
        {kind === "cancel" ? "Access ends on *" : "New terms start *"}
        <input
          type="date"
          required
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
        />
      </label>
      {kind === "plan" && (
        <>
          <label>
            Next payment on new terms *
            <input
              type="date"
              required
              value={nextBilling}
              min={effectiveDate}
              onChange={(e) => setNextBilling(e.target.value)}
            />
          </label>
          <label>
            New plan *
            <input
              required
              maxLength={100}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            />
          </label>
          <label>
            New price (USD) *
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="span-two">
            Billed
            <select
              value={cycle}
              onChange={(e) => setCycle(e.target.value as "monthly" | "yearly")}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        </>
      )}
      <label className="span-two">
        Note <span className="optional">Optional</span>
        <input
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="small-note span-two">
        {kind === "cancel"
          ? `Stays in your costs until ${dateLabel(effectiveDate, true)}; no renewal on or after that date.`
          : `Current terms apply until ${dateLabel(effectiveDate, true)}.`}{" "}
        Recorded reduction: {money(reduction)} / month
        {effectiveDate > today() ? " (projected until then)" : ""}.
      </p>
      <label className="checkbox span-two">
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
        />
        I made this change with {sub.name} myself.
      </label>
      {error && (
        <div className="notice error span-two" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions span-two">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={busy || !attested}>
          {busy && <Loader2 className="spin" size={16} />}
          {initial ? "Save correction" : "Record change"}
        </button>
      </div>
    </form>
  );
}

const KIND_ICON: Record<ActionKind, React.ReactNode> = {
  cancel: <LogOut size={20} />,
  downgrade: <TrendingDown size={20} />,
  yearly: <CalendarDays size={20} />,
  migrate: <ArrowRight size={20} />,
};
const KIND_TEXT: Record<ActionKind, string> = {
  cancel: "End at the close of the billing period",
  downgrade: "Move to a confirmed cheaper plan",
  yearly: "Switch to a confirmed annual price",
  migrate: "Export, import and verify your data",
};

function ControlledTests({
  sub,
  workspace,
  onAction,
}: {
  sub: Subscription;
  workspace: Workspace;
  onAction: (a: Action) => void;
}) {
  const options = actionOptions(sub);
  const [open, setOpen] = useState<ActionKind | null>(null);
  const running = workspace.actions.some(
    (a) => a.subscriptionId === sub.id && a.status === "running",
  );
  return (
    <section className="controlled-tests">
      <h3>Controlled test change</h3>
      <p className="muted">
        {workspace.mode === "demo"
          ? "Runs the exact change in a hosted test merchant with a real cloud browser."
          : "Rehearses the change on a hosted test merchant. Your real account and totals don’t change."}
      </p>
      {running && (
        <div className="notice" role="status">
          A test change is running for {sub.name}. Follow it in Agent activity.
        </div>
      )}
      <div className="action-options">
        {options.map((o) =>
          open === o.kind ? (
            <PrepareForm
              key={o.kind}
              sub={sub}
              option={o}
              onCancel={() => setOpen(null)}
              onAction={onAction}
            />
          ) : (
            <button
              key={o.kind}
              disabled={!o.available || running}
              onClick={() => setOpen(o.kind)}
              aria-describedby={o.reason ? `why-${o.kind}` : undefined}
            >
              <span>{KIND_ICON[o.kind]}</span>
              <div>
                <strong>{actionNames[o.kind]}</strong>
                <p id={o.reason ? `why-${o.kind}` : undefined}>
                  {o.reason ?? KIND_TEXT[o.kind]}
                </p>
              </div>
              <ChevronRight size={18} />
            </button>
          ),
        )}
      </div>
      <div className="notice">
        <ShieldCheck size={20} />
        <span>
          Only the exact change you approve runs. The test merchant’s final
          state is checked independently.
        </span>
      </div>
    </section>
  );
}

function PrepareForm({
  sub,
  option,
  onCancel,
  onAction,
}: {
  sub: Subscription;
  option: ActionOption;
  onCancel: () => void;
  onAction: (a: Action) => void;
}) {
  const [offerId, setOfferId] = useState(option.offers[0]?.id ?? ""),
    [effectiveDate, setEffectiveDate] = useState(
      defaultEffectiveDate(sub, option.kind),
    ),
    [variant, setVariant] = useState<"standard" | "alternate">("standard"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const offer = option.offers.find((o) => o.id === offerId);
  const endOfPeriod = option.kind === "cancel" || option.kind === "downgrade";
  return (
    <form
      className="prepare-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          onAction(
            await post<Action>("/api/actions/prepare", {
              subscriptionId: sub.id,
              kind: option.kind,
              ...(offerId ? { offerId } : {}),
              effectiveDate,
              variant,
            }),
          );
          onCancel();
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <strong>{actionNames[option.kind]}</strong>
      {option.offers.length > 0 && (
        <label>
          Target terms
          <select value={offerId} onChange={(e) => setOfferId(e.target.value)}>
            {option.offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.plan} · {money(o.price)}/{per(o.cycle)}
                {o.provenance === "demo" ? " (illustrative)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {offer && (
        <p className="small-note">
          {money(monthly(sub) - monthly(offer))} / month less. You’d lose:{" "}
          {offer.capabilityLoss}
        </p>
      )}
      <label>
        {endOfPeriod
          ? "Takes effect (end of period by default)"
          : "Takes effect"}
        <input
          type="date"
          required
          min={today()}
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
        />
      </label>
      <label>
        Test merchant flow
        <select
          value={variant}
          onChange={(e) =>
            setVariant(e.target.value as "standard" | "alternate")
          }
        >
          <option value="standard">Standard</option>
          <option value="alternate">Alternate layout</option>
        </select>
      </label>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="inline-actions">
        <button className="button primary compact" disabled={busy}>
          {busy && <Loader2 className="spin" size={15} />}Prepare exact proposal
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
