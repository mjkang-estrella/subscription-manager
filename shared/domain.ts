import { demoOffers } from "./demoOffers.js";
import type {
  Subscription,
  Recommendation,
  Workspace,
  Evidence,
  Verdict,
  PlanOffer,
} from "./types.js";
export const today = () => new Date().toISOString().slice(0, 10);
export const money = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
export const monthly = (s: Pick<Subscription, "price" | "cycle">) =>
  s.price / (s.cycle === "yearly" ? 12 : 1);
export const isCurrent = (s: Subscription, asOf = today()) =>
  s.status !== "cancelled" &&
  s.status !== "unconfirmed" &&
  (!s.endDate || s.endDate >= asOf);
const dayInMonth = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate())).padStart(2, "0")}`;
export function billingInMonth(s: Subscription, month: string): string | null {
  if (s.status === "cancelled" || s.status === "unconfirmed") return null;
  const [y, m] = month.split("-").map(Number),
    [sy, sm, sd] = s.nextBilling.split("-").map(Number);
  if (y < sy || (y === sy && m < sm) || (s.cycle === "yearly" && m !== sm))
    return null;
  const date = dayInMonth(y, m, sd);
  return s.endDate && date >= s.endDate ? null : date;
}
/** Project the original and scheduled terms on their actual effective dates. */
export function billingEntries(
  s: Subscription,
  month: string,
): { sub: Subscription; date: string }[] {
  const oldDate = billingInMonth(s, month);
  if (!s.scheduledChange) return oldDate ? [{ sub: s, date: oldDate }] : [];
  const change = s.scheduledChange;
  const changed = { ...s, ...change, scheduledChange: undefined };
  const newDate = billingInMonth(changed, month);
  return [
    ...(oldDate && oldDate < change.effectiveDate
      ? [{ sub: s, date: oldDate }]
      : []),
    ...(newDate && newDate >= change.effectiveDate
      ? [{ sub: changed, date: newDate }]
      : []),
  ];
}
export function nextRenewal(s: Subscription, asOf = today()): string | null {
  if (!isCurrent(s, asOf)) return null;
  if (!s.scheduledChange && s.nextBilling >= asOf)
    return !s.endDate || s.nextBilling < s.endDate ? s.nextBilling : null;
  const start = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
  for (let i = 0; i < 25; i++) {
    const date = billingEntries(s, start.toISOString().slice(0, 7))
      .map((x) => x.date)
      .filter((date) => date >= asOf)
      .sort()[0];
    if (date) return date;
    start.setUTCMonth(start.getUTCMonth() + 1);
  }
  return null;
}
export function decidingEvidence(s: Subscription): Evidence | undefined {
  return s.evidence
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => e.source !== "Receipt")
    .sort(
      (a, b) =>
        b.e.observedAt.localeCompare(a.e.observedAt) ||
        (b.e.createdAt ?? "").localeCompare(a.e.createdAt ?? "") ||
        b.index - a.index,
    )[0]?.e;
}
export const evidenceIsFresh = (e: Evidence, asOf = today()) =>
  e.observedAt <= asOf &&
  Date.parse(asOf) - Date.parse(e.observedAt) <= 60 * 86400000;
export const offerIsFresh = (offer: PlanOffer) =>
  Boolean(
    offer.confirmedAt &&
    Number.isFinite(Date.parse(offer.checkedAt)) &&
    Date.now() - Date.parse(offer.checkedAt) >= 0 &&
    Date.now() - Date.parse(offer.checkedAt) <= 30 * 86400000,
  );
function lightlyUsed(e: Evidence) {
  const capacity = e.metric === "days" ? e.days : e.limit;
  return e.usage !== undefined && capacity && e.usage / capacity < 0.15;
}
export function utilization(s: Subscription): {
  label: string;
  tone: "green" | "amber" | "gray";
  detail: string;
} {
  const e = decidingEvidence(s);
  if (!e)
    return {
      label: "Unknown",
      tone: "gray",
      detail: "Add usage or a renewal check-in.",
    };
  if (!evidenceIsFresh(e))
    return {
      label: "Needs refresh",
      tone: "gray",
      detail: "Evidence is older than 60 days.",
    };
  if (e.source === "Browser activity")
    return {
      label: e.usage === 0 ? "No visits observed" : "Browser activity",
      tone: "gray",
      detail: "Partial browser signal. " + e.summary,
    };
  if (e.source === "Check-in")
    return {
      label:
        e.wouldRenew || e.value === "shared" || e.value === "background"
          ? "Worth keeping"
          : "Review renewal",
      tone:
        e.wouldRenew || e.value === "shared" || e.value === "background"
          ? "green"
          : "amber",
      detail: e.summary,
    };
  if (e.usage === undefined)
    return { label: "Unknown", tone: "gray", detail: e.summary };
  if (e.usage === 0)
    return { label: "Not used", tone: "amber", detail: e.summary };
  if (lightlyUsed(e))
    return { label: "Underused", tone: "amber", detail: e.summary };
  return { label: "Actively used", tone: "green", detail: e.summary };
}
export function verdict(s: Subscription): Verdict {
  const evidence = decidingEvidence(s);
  const unknown: Verdict = {
    kind: "needs_evidence",
    label: "Needs evidence",
    detail: "Add meaningful usage or a renewal check-in.",
    evidence,
  };
  if (s.status === "unconfirmed")
    return {
      ...unknown,
      label: "Confirm subscription",
      detail:
        "Historical billing found. Confirm current status and terms before forecasting.",
    };
  if (!isCurrent(s))
    return {
      kind: "keep",
      label: "Cancelled",
      detail: "No future renewals are projected.",
    };
  if (s.status === "cancel_pending")
    return {
      kind: "keep",
      label: "Cancellation recorded",
      detail: `Access ends ${s.endDate}. No renewal on or after that date.`,
    };
  if (s.scheduledChange)
    return {
      kind: "keep",
      label: "Plan change recorded",
      detail: `New terms begin ${s.scheduledChange.effectiveDate}.`,
    };
  if (!evidence || !evidenceIsFresh(evidence))
    return {
      ...unknown,
      detail: evidence
        ? "Refresh evidence before deciding; the last observation is stale."
        : unknown.detail,
    };
  if (evidence.source === "Browser activity")
    return {
      ...unknown,
      detail:
        "Browser visits are partial evidence. Include mobile, shared and background value.",
    };
  const keep =
    evidence.source === "Check-in" &&
    (evidence.wouldRenew === true ||
      evidence.value === "shared" ||
      evidence.value === "background");
  if (keep)
    return { kind: "keep", label: "Keep", detail: evidence.summary, evidence };
  const usable = evidence.usage !== undefined || evidence.source === "Check-in";
  if (!usable) return { ...unknown, detail: evidence.summary };
  const costPerUse =
    evidence.usage &&
    evidence.usage > 0 &&
    evidence.days &&
    (evidence.metric === "uses" || evidence.metric === "days")
      ? (monthly(s) * (evidence.days / 30)) / evidence.usage
      : undefined;
  const base = {
    evidence,
    costPerUse,
    unit: evidence.unit || (evidence.metric === "days" ? "active day" : "use"),
  };
  const make = (
    kind: Recommendation["kind"],
    savings: number,
    title: string,
    offer?: PlanOffer,
  ): Verdict => ({
    kind,
    label: title,
    detail: evidence.summary,
    ...base,
    recommendation: {
      id: `${s.id}-${kind}`,
      subscriptionId: s.id,
      title,
      detail: evidence.summary,
      savings: Math.max(0, savings),
      kind,
      confidence: evidence.confidence === "High" ? "High" : "Medium",
      evidenceId: evidence.id,
      offerId: offer?.id,
      illustrative: s.source === "Demo",
      caveat:
        offer?.provenance === "demo"
          ? "Illustrative demo terms."
          : kind === "cancel"
            ? "Check shared use, stored data and your end date before cancelling."
            : offer
              ? `${offer.capabilityLoss} Terms confirmed ${offer.confirmedAt?.slice(0, 10)}.`
              : "Price unconfirmed. Confirm merchant terms to calculate savings.",
    },
  });
  if (
    evidence.usage === 0 ||
    (evidence.source === "Check-in" && evidence.wouldRenew === false)
  )
    return make("cancel", monthly(s), "Review cancellation");
  const offers = (s.offers ?? []).filter(
    (o) =>
      offerIsFresh(o) &&
      (s.source === "Demo" || o.provenance !== "demo") &&
      monthly(o) < monthly(s) &&
      (o.kind !== "yearly" ||
        (s.cycle === "monthly" && o.cycle === "yearly")) &&
      (o.kind !== "migrate" || s.hasDataToMove === true),
  );
  const offer = offers
    .filter((o) => o.kind === "yearly" || lightlyUsed(evidence))
    .sort((a, b) => monthly(a) - monthly(b))[0];
  if (offer)
    return make(
      offer.kind,
      monthly(s) - monthly(offer),
      offer.kind === "yearly"
        ? "Annual plan available"
        : offer.kind === "migrate"
          ? "Review an alternative"
          : "Review a lower plan",
      offer,
    );
  if (lightlyUsed(evidence)) return make("downgrade", 0, "Review a lower plan");
  return { kind: "keep", label: "Keep", detail: evidence.summary, ...base };
}
export function recommendations(
  subscriptions: Subscription[],
  dismissedIds: readonly string[] = [],
): Recommendation[] {
  return subscriptions
    .filter((s) => isCurrent(s))
    .flatMap((s) => {
      const r = verdict(s).recommendation;
      return r && !dismissedIds.includes(r.id) ? [r] : [];
    });
}
export function createWorkspace(): Workspace {
  const now = today(),
    month = now.slice(0, 7);
  const ev = (summary: string, usage: number, limit?: number): Evidence => ({
    id: crypto.randomUUID(),
    source: "Account activity",
    summary,
    usage,
    limit,
    days: 30,
    metric: "uses",
    unit: "use",
    createdAt: new Date().toISOString(),
    observedAt: now,
    confidence: "High",
  });
  const seeds = [
    [
      "spotify",
      "Spotify",
      "spotify.com",
      "Premium Individual",
      11.99,
      "monthly",
      "Entertainment",
      "#1bca63",
      "S",
      9,
      ev("Listened on 24 of the last 30 days.", 24, 30),
    ],
    [
      "notion",
      "Notion",
      "notion.so",
      "Plus",
      12,
      "monthly",
      "Productivity",
      "#292929",
      "N",
      12,
      ev("Created or edited pages on 21 of the last 30 days.", 21, 30),
    ],
    [
      "adobe",
      "Adobe Creative Cloud",
      "adobe.com",
      "All Apps",
      59.99,
      "monthly",
      "Design",
      "#eb3c32",
      "A",
      16,
      ev("No creative app activity in the last 30 days.", 0, 30),
    ],
    [
      "netflix",
      "Netflix",
      "netflix.com",
      "Standard",
      15.49,
      "monthly",
      "Entertainment",
      "#e50914",
      "N",
      18,
      ev("Watched 12 titles in the last 30 days.", 12, 30),
    ],
    [
      "figma",
      "Figma",
      "figma.com",
      "Professional",
      15,
      "monthly",
      "Design",
      "#9e69ef",
      "F",
      22,
      ev("Edited files on 2 of the last 30 days.", 2, 30),
    ],
    [
      "icloud",
      "iCloud+",
      "apple.com",
      "200 GB",
      2.99,
      "monthly",
      "Storage",
      "#3e9cf4",
      "i",
      24,
      ev("146 GB of 200 GB used for photos and backups.", 146, 200),
    ],
    [
      "github",
      "GitHub",
      "github.com",
      "Pro",
      48,
      "yearly",
      "Developer tools",
      "#292929",
      "G",
      27,
      ev("34 contributions and 8 active repositories this month.", 34, 50),
    ],
    [
      "youtube",
      "YouTube Premium",
      "youtube.com",
      "Individual",
      13.99,
      "monthly",
      "Entertainment",
      "#f23b37",
      "▶",
      28,
      ev("No premium activity reported in the last 30 days.", 0, 30),
    ],
  ] as const;
  return {
    schemaVersion: 2,
    keptRenewals: {},
    outcomes: [],
    mode: "demo",
    createdAt: new Date().toISOString(),
    actions: [],
    subscriptions: seeds.map(
      ([
        id,
        name,
        domain,
        plan,
        price,
        cycle,
        category,
        color,
        icon,
        d,
        evidence,
      ]) => ({
        id,
        name,
        domain,
        plan,
        price,
        cycle,
        category,
        color,
        icon,
        nextBilling: `${month}-${String(Math.min(d, new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate())).padStart(2, "0")}`,
        currency: "USD",
        status: "active",
        source: "Demo",
        evidence: [
          {
            ...evidence,
            metric:
              id === "icloud"
                ? "quota"
                : ["spotify", "notion", "figma"].includes(id)
                  ? "days"
                  : "uses",
            unit:
              id === "icloud"
                ? "GB"
                : ["spotify", "notion", "figma"].includes(id)
                  ? "active day"
                  : "use",
          },
        ],
        charges: [],
        hasDataToMove: ["notion", "figma", "icloud", "github"].includes(id),
        offers: demoOffers({
          id,
          price,
          cycle,
          hasDataToMove: ["notion", "figma", "icloud", "github"].includes(id),
          createdAt: new Date().toISOString(),
        }),
        notes: "Illustrative demo account. Prices and usage are sample data.",
        createdAt: new Date().toISOString(),
      }),
    ),
  };
}
