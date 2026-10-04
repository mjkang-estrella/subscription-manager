import type { PlanOffer, Subscription } from "./types.js";

/** Prices belong only to the controlled demo merchant catalogue. */
export function demoOffers(
  sub: Pick<
    Subscription,
    "id" | "price" | "cycle" | "hasDataToMove" | "createdAt"
  >,
): PlanOffer[] {
  const monthlyPrice = sub.cycle === "yearly" ? sub.price / 12 : sub.price;
  const rounded = (amount: number) => Math.round(amount * 100) / 100;
  const make = (
    kind: PlanOffer["kind"],
    plan: string,
    price: number,
    cycle: PlanOffer["cycle"],
  ): PlanOffer => ({
    id: `${sub.id}-demo-${kind}`,
    kind,
    plan,
    price,
    cycle,
    checkedAt: sub.createdAt,
    confirmedAt: sub.createdAt,
    provenance: "demo",
    capabilityLoss:
      "Illustrative controlled test plan; real merchant terms are not represented.",
    ...(kind === "migrate"
      ? { migrationEffort: "Transfer and verify three synthetic documents." }
      : {}),
  });
  if (monthlyPrice <= 0) return [];
  const offers = [
    make("downgrade", "Starter", rounded(monthlyPrice * 0.6), "monthly"),
  ];
  if (sub.cycle === "monthly")
    offers.push(
      make("yearly", "Annual", rounded(monthlyPrice * 12 * 0.8), "yearly"),
    );
  if (sub.hasDataToMove)
    offers.push(
      make(
        "migrate",
        "Replacement Basic",
        rounded(monthlyPrice * 0.5),
        "monthly",
      ),
    );
  return offers.filter(
    (o) => (o.cycle === "yearly" ? o.price / 12 : o.price) < monthlyPrice,
  );
}
