import { useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import type { Subscription, Workspace } from "../shared/types";
import { money, today } from "../shared/domain";
import { post } from "./api";
import { Logo } from "./components";
import { dateLabel, errorText, per, relativeDays } from "./format";
import { renewalQueue, type Decision, type VisitSummary } from "./model";

const COLLAPSED = 3;

const KIND: Record<Decision["verdict"]["kind"], string> = {
  keep: "Keep",
  needs_evidence: "Needs evidence",
  cancel: "Consider cancelling",
  downgrade: "Cheaper plan",
  yearly: "Annual plan",
  migrate: "Alternative",
};

const detail = (d: Decision) =>
  [
    d.reason === "stale" ? "Evidence is stale" : KIND[d.verdict.kind],
    d.renewal ? `renews ${relativeDays(today(), d.renewal)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

export function RenewalDecisions({
  workspace,
  onOpen,
  onRefresh,
  onNotify,
}: {
  workspace: Workspace;
  onOpen: (s: Subscription) => void;
  onRefresh: () => Promise<void>;
  onNotify: (s: string) => void;
}) {
  const queue = renewalQueue(workspace);
  const [keeping, setKeeping] = useState<string | null>(null),
    [expanded, setExpanded] = useState(false),
    [error, setError] = useState("");
  const shown = expanded ? queue : queue.slice(0, COLLAPSED);
  return (
    <section className="panel decisions-panel" aria-labelledby="decisions-title">
      <div className="panel-heading">
        <h2 id="decisions-title">Renewal decisions</h2>
        {queue.length > 0 && <span className="count-pill">{queue.length}</span>}
      </div>
      {queue.length ? (
        <>
        <ul className="decision-list" id="decision-list">
          {shown.map((d) => {
            const priced = d.verdict.recommendation?.savings ?? 0;
            return (
              <li key={d.sub.id}>
                <button className="decision-main" onClick={() => onOpen(d.sub)}>
                  <Logo sub={d.sub} small />
                  <span className="decision-text">
                    <strong>{d.sub.name}</strong>
                    <small>{detail(d)}</small>
                  </span>
                  <span className="decision-amount">
                    <strong>
                      {money(d.sub.price)}
                      <small>/{per(d.sub.cycle)}</small>
                    </strong>
                    {priced > 0 && (
                      <small className="decision-saving">Save {money(priced)}/mo</small>
                    )}
                  </span>
                </button>
                <div className="decision-actions">
                  <button
                    className="button secondary compact"
                    disabled={keeping !== null || !d.renewal}
                    title={d.renewal ? undefined : "No upcoming renewal"}
                    onClick={async () => {
                      setKeeping(d.sub.id);
                      setError("");
                      try {
                        const r = await post<{ renewal: string }>(
                          `/api/subscriptions/${d.sub.id}/keep`,
                        );
                        await onRefresh();
                        onNotify(
                          `Keeping ${d.sub.name} through the ${dateLabel(r.renewal)} renewal.`,
                        );
                      } catch (e) {
                        setError(errorText(e));
                      } finally {
                        setKeeping(null);
                      }
                    }}
                  >
                    {keeping === d.sub.id ? (
                      <Loader2 className="spin" size={14} />
                    ) : (
                      <Check size={14} />
                    )}
                    Keep
                  </button>
                  <button
                    className="button primary compact"
                    onClick={() => onOpen(d.sub)}
                  >
                    Review
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {queue.length > COLLAPSED && (
          <button
            className="calendar-link"
            aria-expanded={expanded}
            aria-controls="decision-list"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Show fewer" : `Show all ${queue.length}`}
            <ChevronDown size={15} className={expanded ? "flip" : ""} />
          </button>
        )}
        </>
      ) : (
        <p className="muted decisions-empty">
          Nothing to decide right now. Kept items return at their next renewal.
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

export function SinceLastVisit({
  summary,
  onOpen,
  onDismiss,
}: {
  summary: VisitSummary;
  onOpen: (s: Subscription) => void;
  onDismiss: () => void;
}) {
  const lines: { key: string; text: string; sub?: Subscription }[] = [];
  for (const o of summary.outcomes)
    lines.push({
      key: `o-${o.id}`,
      text: `${o.source === "demo" ? "Demo ledger: " : "You recorded: "}${o.subscriptionName} ${o.kind === "cancel" ? `ends ${dateLabel(o.effectiveDate)}` : `changes to ${o.after.plan} on ${dateLabel(o.effectiveDate)}`}`,
    });
  for (const p of summary.priceChanges.slice(0, 3))
    lines.push({
      key: `p-${p.sub.id}-${p.date}`,
      sub: p.sub,
      text: `${p.sub.name} charged ${money(p.to)} on ${dateLabel(p.date)} (was ${money(p.from)})`,
    });
  for (const a of summary.alerts.slice(0, 3))
    lines.push({ key: `a-${a.sub.id}-${a.text}`, sub: a.sub, text: `${a.sub.name}: ${a.text}` });
  for (const a of summary.completedActions.slice(0, 2))
    lines.push({
      key: `x-${a.id}`,
      text: `Test change verified: ${a.subscriptionName}`,
    });
  if (summary.newSubscriptions.length)
    lines.push({
      key: "new",
      text: `${summary.newSubscriptions.length} subscription${summary.newSubscriptions.length === 1 ? "" : "s"} added`,
    });
  const projected = summary.projectedRenewals;
  if (projected.length)
    lines.push({
      key: "proj",
      text: `${projected.length} projected renewal${projected.length === 1 ? "" : "s"} (${money(projected.reduce((a, p) => a + p.sub.price, 0))}) passed. Projected, not confirmed charges.`,
    });
  return (
    <section className="visit-summary" aria-label="Since your last visit">
      <div>
        <h2>Since {dateLabel(summary.since.slice(0, 10))}</h2>
        <ul>
          {lines.slice(0, 6).map((l) => (
            <li key={l.key}>
              {l.sub ? (
                <button className="text-button inline" onClick={() => onOpen(l.sub!)}>
                  {l.text}
                </button>
              ) : (
                l.text
              )}
            </li>
          ))}
        </ul>
      </div>
      <button
        className="icon-button"
        aria-label="Dismiss summary"
        onClick={onDismiss}
      >
        <X size={17} />
      </button>
    </section>
  );
}
