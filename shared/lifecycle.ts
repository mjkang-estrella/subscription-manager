import { demoOffers } from "./demoOffers.js";
import type {
  Workspace,
  Subscription,
  Terms,
  RecordedOutcome,
} from "./types.js";
import { monthly, today, offerIsFresh } from "./domain.js";
export const termsOf = (s: Subscription): Terms => ({
  plan: s.plan,
  price: s.price,
  cycle: s.cycle,
  status: s.status,
  nextBilling: s.nextBilling,
  ...(s.endDate ? { endDate: s.endDate } : {}),
});
export const subscriptionFingerprint = (s: Subscription) =>
  JSON.stringify({
    ...termsOf(s),
    id: s.id,
    name: s.name,
    domain: s.domain,
    source: s.source,
    hasDataToMove: s.hasDataToMove ?? false,
    offers: s.offers ?? [],
    scheduledChange: s.scheduledChange ?? null,
  });
export function migrateWorkspace(data: Workspace, asOf = today()): boolean {
  const before = JSON.stringify(data);
  data.schemaVersion = 2;
  data.keptRenewals ??= {};
  data.outcomes ??= [];
  data.dismissedOpportunityIds ??= [];
  for (const a of data.actions) {
    if (
      a.status === "awaiting_approval" &&
      Date.parse(
        a.expiresAt ??
          new Date(Date.parse(a.createdAt) + 86400000).toISOString(),
      ) < Date.now()
    )
      a.status = "expired";
  }
  for (const s of data.subscriptions) {
    s.charges ??= [];
    s.offers ??= [];
    s.alerts ??= [];
    if (s.status === "cancel_pending" && s.endDate && s.endDate < asOf)
      s.status = "cancelled";
    if (s.scheduledChange && s.scheduledChange.effectiveDate <= asOf) {
      const change = s.scheduledChange;
      Object.assign(s, {
        plan: change.plan,
        price: change.price,
        cycle: change.cycle,
        nextBilling: change.nextBilling,
        status: "active",
      });
      delete s.scheduledChange;
      delete s.endDate;
    }
    if (s.source === "Demo") {
      // These IDs have actual synthetic export documents in the controlled fixture.
      s.hasDataToMove ??= ["notion", "figma", "icloud", "github"].includes(
        s.id,
      );
      const approvalLocked = data.actions.some(
        (a) =>
          a.subscriptionId === s.id &&
          ["awaiting_approval", "running"].includes(a.status),
      );
      if (approvalLocked) continue;
      for (const offer of s.offers) {
        if (offer.provenance === "demo" && !offerIsFresh(offer)) {
          offer.checkedAt = new Date().toISOString();
          offer.confirmedAt = offer.checkedAt;
        }
      }
      for (const offer of demoOffers({
        ...s,
        createdAt: new Date().toISOString(),
      }))
        if (
          !s.offers.some(
            (o) => o.kind === offer.kind && o.provenance === "demo",
          )
        )
          s.offers.push(offer);
    }
  }
  return before !== JSON.stringify(data);
}
export type OutcomeInput = {
  kind: "cancel" | "plan";
  effectiveDate: string;
  plan?: string;
  price?: number;
  cycle?: "monthly" | "yearly";
  nextBilling?: string;
  note?: string;
};
export function recordOutcome(
  data: Workspace,
  subscriptionId: string,
  input: OutcomeInput,
  source: "manual" | "demo" = "manual",
): RecordedOutcome {
  const s = data.subscriptions.find((x) => x.id === subscriptionId);
  if (!s) throw new Error("Subscription not found.");
  if (source === "demo" && (data.mode !== "demo" || s.source !== "Demo"))
    throw new Error("Test outcomes can only update a demo subscription.");
  if (source === "manual" && s.source === "Demo")
    throw new Error(
      "Start a personal workspace before recording a real change.",
    );
  if (
    data.actions.some(
      (a) => a.subscriptionId === s.id && a.status === "running",
    )
  )
    throw new Error(
      "Wait for the running test to finish before changing the record.",
    );
  const before = termsOf(s);
  const baseline =
    (data.outcomes ?? [])
      .filter((o) => o.subscriptionId === s.id && o.source === source)
      .at(-1)?.before ?? before;
  const previousExpected =
    baseline.status === "cancelled" ||
    baseline.status === "cancel_pending" ||
    baseline.status === "unconfirmed"
      ? 0
      : monthly(baseline);
  const after: Terms =
    input.kind === "cancel"
      ? {
          ...before,
          status:
            input.effectiveDate >= today() ? "cancel_pending" : "cancelled",
          endDate: input.effectiveDate,
        }
      : {
          plan: input.plan!,
          price: input.price!,
          cycle: input.cycle!,
          nextBilling: input.nextBilling!,
          status: "active",
        };
  if (
    input.kind === "plan" &&
    (!after.plan ||
      !Number.isFinite(after.price) ||
      after.price < 0 ||
      !after.cycle ||
      !after.nextBilling)
  )
    throw new Error("Enter the complete new plan, price and billing date.");
  if (input.kind === "plan") s.priceKnown = true;
  const targetMonthly = input.kind === "cancel" ? 0 : monthly(after);
  if (input.kind === "cancel") {
    s.status = after.status;
    s.endDate = input.effectiveDate;
    delete s.scheduledChange;
  } else if (input.effectiveDate > today()) {
    s.scheduledChange = {
      plan: after.plan,
      price: after.price,
      cycle: after.cycle,
      nextBilling: after.nextBilling,
      effectiveDate: input.effectiveDate,
    };
    s.status = "active";
    delete s.endDate;
  } else {
    Object.assign(s, after);
    delete s.endDate;
    delete s.scheduledChange;
  }
  const outcome: RecordedOutcome = {
    id: crypto.randomUUID(),
    subscriptionId: s.id,
    subscriptionName: s.name,
    source,
    kind: input.kind,
    before,
    after,
    effectiveDate: input.effectiveDate,
    recordedAt: new Date().toISOString(),
    monthlyReduction:
      Math.round((previousExpected - targetMonthly) * 100) / 100,
    note: input.note,
  };
  (data.outcomes ??= []).unshift(outcome);
  if (input.kind === "plan")
    s.evidence.push({
      id: crypto.randomUUID(),
      source: "Self-reported",
      summary: "Plan terms changed. Add usage evidence for the new plan.",
      observedAt: today(),
      createdAt: new Date().toISOString(),
      confidence: "Low",
    });
  for (const a of data.actions)
    if (a.subscriptionId === s.id && a.status === "awaiting_approval")
      a.status = "superseded";
  delete data.keptRenewals?.[s.id];
  return outcome;
}
