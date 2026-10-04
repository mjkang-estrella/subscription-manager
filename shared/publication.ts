import type { Subscription, Workspace } from "./types.js";

export type PublicHistory = {
  publishedAt: string;
  subscriptions: Subscription[];
};

/** Publish billing facts only, never workspace capabilities or email links. */
export function publicHistory(
  workspace: Workspace,
  publishedAt = new Date().toISOString(),
): PublicHistory {
  return {
    publishedAt,
    subscriptions: workspace.subscriptions.map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      plan: s.plan,
      price: s.price,
      priceKnown: s.priceKnown,
      currency: s.currency,
      cycle: s.cycle,
      nextBilling: s.nextBilling,
      category: s.category,
      color: s.color,
      icon: s.icon,
      status: s.status,
      endDate: s.endDate,
      billingNote: s.billingNote,
      source: s.source,
      createdAt: s.createdAt,
      notes: "",
      evidence: [],
      charges: s.charges?.map((c, i) => ({
        id: `${s.id}-payment-${i}`,
        date: c.date,
        amount: c.amount,
        currency: c.currency,
        source: c.source,
      })),
    })),
  };
}
