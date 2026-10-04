import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ExternalLink,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { Action, Workspace } from "../shared/types";
import { money } from "../shared/domain";
import { api, post } from "./api";
import { ActionProgress, Modal } from "./components";
import { actionNames, dateLabel, errorText, per } from "./format";
import { canApplyToDemo, RETRYABLE_STATES } from "./model";

const STATUS_NOTE: Partial<Record<Action["status"], string>> = {
  discarded: "You discarded this proposal. Nothing ran.",
  expired:
    "This proposal expired before approval. Prepare it again to review current terms.",
  superseded:
    "Replaced by a newer change to this subscription. Nothing else will run from it.",
  historical:
    "Restored from a backup as a record only. It can’t be approved or run.",
};

export function ActionDialog({
  action,
  workspace,
  onClose,
  onAction,
  onWorkspace,
  onRecordOwn,
  onNotify,
}: {
  action: Action;
  workspace: Workspace;
  onClose: () => void;
  onAction: (a: Action) => void;
  onWorkspace: (ws: Workspace) => void;
  onRecordOwn: (subscriptionId: string) => void;
  onNotify: (s: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const sub = workspace.subscriptions.find((s) => s.id === action.subscriptionId);
  const offer = sub?.offers?.find((o) => o.id === action.offerId);
  const demoTerms = sub?.source === "Demo" || offer?.provenance === "demo";
  const run = async (name: string, task: () => Promise<void>) => {
    setBusy(name);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const fetchAction = async (id = action.id) =>
    onAction(await api<Action>(`/api/actions/${id}`));
  const awaiting = action.status === "awaiting_approval";
  const retryable = RETRYABLE_STATES.includes(action.status);
  const scheduled =
    action.kind === "cancel" || action.kind === "downgrade"
      ? "Scheduled for the end of the period you approved."
      : undefined;

  return (
    <Modal
      title={awaiting ? "Review your exact change" : "Your change, step by step"}
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="notice sandbox">
          <ShieldCheck size={19} />
          <span>
            <strong>Controlled test merchant</strong> ·{" "}
            {workspace.mode === "demo"
              ? "Runs against hosted test pages, not a real account."
              : "A rehearsal only. Your real subscription and totals stay unchanged."}
          </span>
        </div>
        <div className="action-title">
          <h3>{actionNames[action.kind]}</h3>
          <span>{action.subscriptionName}</span>
        </div>
        <div className="comparison">
          <div>
            <span>Now</span>
            <h3>{action.fromPlan}</h3>
            <strong>
              {money(action.fromPrice)}
              <small> / {per(action.fromCycle)}</small>
            </strong>
          </div>
          <ArrowRight size={22} aria-hidden="true" />
          <div>
            <span>After</span>
            <h3>{action.toPlan}</h3>
            <strong>
              {action.kind === "cancel" ? (
                "No renewal"
              ) : (
                <>
                  {money(action.toPrice)}
                  <small> / {per(action.toCycle)}</small>
                </>
              )}
            </strong>
          </div>
        </div>
        <div className="action-consequences">
          <span>
            <CalendarDays size={16} />
            Effective {dateLabel(action.effectiveDate, true)}
          </span>
          <p>{action.consequence}</p>
          <small>
            {demoTerms
              ? "Illustrative test terms, not an offer from the real merchant."
              : offer?.confirmedAt
                ? `Target terms you confirmed on ${dateLabel(offer.confirmedAt, true)}.`
                : "Terms based on your current plan."}
            {awaiting && action.expiresAt
              ? ` Proposal expires ${new Date(action.expiresAt).toLocaleString()}.`
              : ""}
          </small>
        </div>

        {awaiting && (
          <div className="action-buttons">
            <button
              className="button secondary"
              disabled={busy !== null}
              onClick={() =>
                void run("discard", async () => {
                  onAction(await post<Action>(`/api/actions/${action.id}/discard`));
                  onNotify("Proposal discarded.");
                })
              }
            >
              {busy === "discard" && <Loader2 className="spin" size={16} />}
              Discard
            </button>
            <button
              className="button primary"
              disabled={busy !== null}
              onClick={() =>
                void run("approve", async () => {
                  await post(`/api/actions/${action.id}/approve`);
                  await fetchAction();
                })
              }
            >
              {busy === "approve" ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}
              Approve this exact change
            </button>
          </div>
        )}

        {(action.status === "running" ||
          action.status === "completed" ||
          action.status === "failed") &&
          action.steps.length > 0 && <ActionProgress action={action} />}
        {action.status === "running" && (
          <p className="small-note">
            You can close this. Progress continues and shows in Agent activity.
          </p>
        )}
        {STATUS_NOTE[action.status] && (
          <p className="notice" role="status">
            {STATUS_NOTE[action.status]}
          </p>
        )}
        {retryable && (
          <div className="action-buttons">
            <button
              className="button primary"
              disabled={busy !== null}
              onClick={() =>
                void run("reprepare", async () => {
                  onAction(
                    await post<Action>(`/api/actions/${action.id}/reprepare`),
                  );
                  onNotify("A fresh proposal is ready for review.");
                })
              }
            >
              {busy === "reprepare" ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <RotateCcw size={16} />
              )}
              Prepare again for fresh approval
            </button>
          </div>
        )}

        {action.status === "completed" && (
          <div className="completed-actions">
            {action.verification?.scheduled && scheduled && (
              <p className="small-note">{scheduled}</p>
            )}
            {action.artifactAvailable && (
              <a
                className="text-button"
                href={`/api/actions/${encodeURIComponent(action.id)}/artifact`}
                target="_blank"
                rel="noreferrer noopener"
              >
                View verification screenshot <ExternalLink size={13} />
              </a>
            )}
            {action.appliedAt ? (
              <p className="notice" role="status">
                Applied to the demo ledger on {dateLabel(action.appliedAt.slice(0, 10), true)}.
              </p>
            ) : canApplyToDemo(action, workspace) ? (
              <div className="apply-demo">
                <p>
                  Update the demo subscription to match this verified test?
                  Its cost, calendar and suggestions will change.
                </p>
                <button
                  className="button primary"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("apply", async () => {
                      onWorkspace(
                        await post<Workspace>(`/api/actions/${action.id}/apply`),
                      );
                      await fetchAction();
                      onNotify("Applied to the demo ledger.");
                    })
                  }
                >
                  {busy === "apply" && <Loader2 className="spin" size={16} />}
                  Apply to demo ledger
                </button>
              </div>
            ) : (
              <div className="apply-demo">
                <p>
                  This was a test. It doesn’t change your tracked subscription
                  or count as savings.
                </p>
                <button
                  className="button secondary"
                  onClick={() => onRecordOwn(action.subscriptionId)}
                >
                  Record a change you made yourself
                </button>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
