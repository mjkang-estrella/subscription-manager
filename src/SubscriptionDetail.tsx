import { useState } from "react";
import { CircleAlert, FileText, Sparkles, X } from "lucide-react";
import type { Action, Subscription, Workspace } from "../shared/types";
import {
  decidingEvidence,
  evidenceIsFresh,
  money,
  monthly,
  nextRenewal,
  verdict,
} from "../shared/domain";
import { del } from "./api";
import { Logo, UsageBadge, useDrawerFocus } from "./components";
import { dateLabel, errorText, per } from "./format";
import { UsagePanel, evidenceMeasure } from "./UsagePanel";
import { AlternativesPanel } from "./AlternativesPanel";
import { ChangePanel } from "./ChangePanel";

export type DetailTab = "overview" | "usage" | "alternatives" | "change";
const TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "usage", label: "Usage" },
  { id: "alternatives", label: "Plans" },
  { id: "change", label: "Change" },
];

export function SubscriptionDetail({
  sub,
  workspace,
  initialTab = "overview",
  dismissing,
  onDismiss,
  onClose,
  onEdit,
  onRefresh,
  onWorkspace,
  onAction,
  onNotify,
}: {
  sub: Subscription;
  workspace: Workspace;
  initialTab?: DetailTab;
  dismissing: boolean;
  onDismiss: (id: string, dismissed: boolean) => Promise<void>;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => Promise<void>;
  onWorkspace: (ws: Workspace) => void;
  onAction: (a: Action) => void;
  onNotify: (s: string) => void;
}) {
  const focusRef = useDrawerFocus();
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const demo = workspace.mode === "demo";
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        ref={focusRef}
        tabIndex={-1}
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${sub.name} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-toolbar">
          <span>Subscription details</span>
          <button
            className="icon-button"
            aria-label="Close subscription details"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <div className="detail-hero">
          <Logo sub={sub} />
          <div>
            <h2>{sub.name}</h2>
            <p>
              {sub.plan}{" "}
              <span>
                · {sub.source === "Demo" ? "Demo subscription" : sub.source}
              </span>
            </p>
          </div>
          <button className="button secondary compact" onClick={onEdit}>
            Edit
          </button>
        </div>
        <div
          className="detail-tabs"
          role="tablist"
          aria-label="Subscription sections"
        >
          {TABS.map((t) => (
            <button
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
              key={t.id}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="detail-content" role="tabpanel">
          {tab === "overview" && (
            <Overview
              sub={sub}
              workspace={workspace}
              dismissing={dismissing}
              onDismiss={onDismiss}
              onTab={setTab}
              onRefresh={onRefresh}
              onClose={onClose}
              onNotify={onNotify}
            />
          )}
          {tab === "usage" && (
            <UsagePanel
              sub={sub}
              demo={demo}
              onRefresh={onRefresh}
              onNotify={onNotify}
            />
          )}
          {tab === "alternatives" && (
            <AlternativesPanel
              sub={sub}
              onRefresh={onRefresh}
              onNotify={onNotify}
            />
          )}
          {tab === "change" && (
            <ChangePanel
              sub={sub}
              workspace={workspace}
              onWorkspace={(ws) => {
                onWorkspace(ws);
                onNotify("Change recorded.");
              }}
              onAction={onAction}
              onEdit={onEdit}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function Overview({
  sub,
  workspace,
  dismissing,
  onDismiss,
  onTab,
  onRefresh,
  onClose,
  onNotify,
}: {
  sub: Subscription;
  workspace: Workspace;
  dismissing: boolean;
  onDismiss: (id: string, dismissed: boolean) => Promise<void>;
  onTab: (t: DetailTab) => void;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  onNotify: (s: string) => void;
}) {
  const v = verdict(sub);
  const deciding = decidingEvidence(sub);
  const renewal = nextRenewal(sub);
  const rec = v.recommendation;
  const dismissed = Boolean(
    rec && workspace.dismissedOpportunityIds?.includes(rec.id),
  );
  const [allCharges, setAllCharges] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const charges = [...(sub.charges ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  return (
    <>
      {sub.status === "unconfirmed" && (
        <div className="notice">
          Current billing terms need confirmation; excluded from spending and
          renewals. Edit the subscription to confirm current terms.
        </div>
      )}
      {sub.billingNote && <p className="small-note">{sub.billingNote}</p>}
      <div className="detail-price">
        <strong>
          {sub.priceKnown === false
            ? "Unknown price"
            : money(sub.price, sub.currency)}
        </strong>
        <span>
          {sub.status === "unconfirmed"
            ? "last known amount"
            : `per ${per(sub.cycle)}`}
        </span>
        <UsageBadge sub={sub} />
      </div>
      <div className="detail-facts">
        <div>
          <span>
            {sub.status === "cancel_pending" ? "Access ends" : "Next renewal"}
          </span>
          <strong>
            {sub.status === "cancel_pending" && sub.endDate
              ? dateLabel(sub.endDate, true)
              : renewal
                ? dateLabel(renewal, true)
                : "None projected"}
          </strong>
        </div>
        <div>
          <span>
            {sub.status === "unconfirmed" ? "Forecast" : "Monthly equivalent"}
          </span>
          <strong>
            {sub.status === "unconfirmed"
              ? "Excluded until confirmed"
              : money(monthly(sub), sub.currency)}
          </strong>
        </div>
        <div>
          <span>Category</span>
          <strong>{sub.category}</strong>
        </div>
        <div>
          <span>Website</span>
          <strong>{sub.domain || "Not provided"}</strong>
        </div>
      </div>
      {sub.scheduledChange && (
        <p className="notice" role="status">
          Changes to {sub.scheduledChange.plan} at{" "}
          {money(sub.scheduledChange.price, sub.currency)}/
          {per(sub.scheduledChange.cycle)} on{" "}
          {dateLabel(sub.scheduledChange.effectiveDate, true)}.
        </p>
      )}
      {(sub.alerts ?? []).length > 0 && (
        <ul className="notice warning alert-list" aria-label="Alerts">
          {sub.alerts!.map((a) => (
            <li key={a}>
              <CircleAlert size={15} />
              {a}
            </li>
          ))}
        </ul>
      )}

      <section className={`verdict verdict-${v.kind}`} aria-label="Verdict">
        <div className="verdict-head">
          <Sparkles size={19} />
          <h3>{v.label}</h3>
        </div>
        <p>{v.detail}</p>
        {deciding ? (
          <p className="verdict-source">
            <FileText size={14} />
            Based on {deciding.source.toLowerCase()} from{" "}
            {dateLabel(deciding.observedAt, true)} · {deciding.confidence}{" "}
            confidence
            {evidenceMeasure(deciding) ? ` · ${evidenceMeasure(deciding)}` : ""}
            {!evidenceIsFresh(deciding) ? " · stale" : ""}
          </p>
        ) : null}
        {v.costPerUse !== undefined && (
          <p className="verdict-source">
            About {money(v.costPerUse, sub.currency)} per {v.unit ?? "use"}
          </p>
        )}
        {rec && !dismissed && (
          <>
            <strong className="verdict-saving">
              {rec.savings > 0
                ? `${money(rec.savings, sub.currency)} / month ${rec.illustrative ? "demo estimate" : "potential"}`
                : rec.kind === "cancel"
                  ? ""
                  : "Price unconfirmed"}
            </strong>
            <small>{rec.caveat}</small>
            <div className="inline-actions">
              <button
                className="button primary compact"
                onClick={() => onTab("change")}
              >
                Review change
              </button>
              {rec.savings === 0 && rec.kind !== "cancel" && (
                <button
                  className="button secondary compact"
                  onClick={() => onTab("alternatives")}
                >
                  Confirm a price
                </button>
              )}
              <button
                className="text-button"
                disabled={dismissing}
                onClick={() => void onDismiss(rec.id, true)}
              >
                {dismissing ? "Dismissing…" : "Dismiss"}
              </button>
            </div>
          </>
        )}
        {rec && dismissed && (
          <div className="dismissed-opportunity" role="status">
            <span>Suggestion dismissed.</span>
            <button
              className="text-button"
              disabled={dismissing}
              onClick={() => void onDismiss(rec.id, false)}
            >
              {dismissing ? "Restoring…" : "Restore"}
            </button>
          </div>
        )}
        {v.kind === "needs_evidence" && (
          <button
            className="button secondary compact"
            onClick={() => onTab("usage")}
          >
            Add evidence or check in
          </button>
        )}
      </section>

      {charges.length > 0 && (
        <section className="charge-history">
          <h3 className="detail-subheading">Charge history</h3>
          <ul>
            {charges.slice(0, allCharges ? undefined : 12).map((c) => (
              <li key={c.id} className={c.amount < 0 ? "refund" : ""}>
                <span>{dateLabel(c.date, true)}</span>
                <span className="charge-desc">
                  {c.sourceUrl ? (
                    <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                      View receipt
                    </a>
                  ) : (
                    c.source
                  )}
                </span>
                <strong>
                  {c.amount < 0 ? "Refund " : ""}
                  {money(Math.abs(c.amount), c.currency)}
                </strong>
              </li>
            ))}
          </ul>
          {charges.length > 12 && (
            <button
              className="text-button"
              onClick={() => setAllCharges(!allCharges)}
            >
              {allCharges
                ? "Show recent charges"
                : `Show all ${charges.length} charges`}
            </button>
          )}
          <small className="muted">
            Imported or recorded charges. Projected renewals are not added here.
          </small>
        </section>
      )}

      {sub.evidence.filter((e) => e.sourceUrl).length > 0 && (
        <section className="charge-history">
          <h3 className="detail-subheading">Billing evidence</h3>
          {sub.evidence
            .filter((e) => e.sourceUrl)
            .map((e) => (
              <p key={e.id} className="small-note">
                {e.summary}{" "}
                <a href={e.sourceUrl} target="_blank" rel="noreferrer">
                  View source
                </a>
              </p>
            ))}
        </section>
      )}
      {sub.notes && <p className="small-note">{sub.notes}</p>}
      <div className="remove-subscription">
        {removeConfirm ? (
          <div className="notice">
            <span>
              Remove this record from Folio? This doesn’t cancel the
              subscription.
            </span>
            <button
              className="text-button danger"
              disabled={working}
              onClick={async () => {
                setWorking(true);
                setError("");
                try {
                  await del(`/api/subscriptions/${sub.id}`);
                  await onRefresh();
                  onClose();
                  onNotify("Subscription removed from Folio.");
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setWorking(false);
                }
              }}
            >
              Remove
            </button>
            <button
              className="text-button"
              onClick={() => setRemoveConfirm(false)}
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            className="text-button"
            onClick={() => setRemoveConfirm(true)}
          >
            Remove from Folio
          </button>
        )}
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
