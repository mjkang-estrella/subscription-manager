import type {
  Action,
  ActionKind,
  Category,
  PlanOffer,
  RecordedOutcome,
  Subscription,
  Verdict,
  Workspace,
} from "../shared/types";
import {
  billingEntries,
  evidenceIsFresh,
  isCurrent,
  monthly,
  nextRenewal,
  offerIsFresh,
  recommendations,
  today,
  verdict,
} from "../shared/domain";

export const current = (ws: Workspace, asOf = today()) =>
  ws.subscriptions.filter((s) => isCurrent(s, asOf));

/**
 * Latest record per subscription and source. Each record's monthlyReduction is
 * cumulative against the earliest before-terms, so a correction replaces rather
 * than adds. Records are stored newest-first; on equal timestamps the first wins.
 */
export function latestOutcomes(outcomes: RecordedOutcome[] = []) {
  const latest = new Map<string, RecordedOutcome>();
  for (const o of outcomes) {
    const key = `${o.source}:${o.subscriptionId}`;
    const prior = latest.get(key);
    if (!prior || o.recordedAt > prior.recordedAt) latest.set(key, o);
  }
  return [...latest.values()].sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt),
  );
}

export type SavingsSummary = {
  /** Potential monthly savings with a confirmed price (or a labeled demo delta). */
  potential: number;
  /** Part of `potential` that comes from illustrative demo terms. */
  demoPotential: number;
  opportunities: number;
  /** Suggestions that need a confirmed price before any dollars count. */
  unpriced: number;
  /** User-recorded personal reductions, by effective state. */
  recorded: number;
  recordedProjected: number;
  /** Reductions applied to the demo ledger from controlled test runs. */
  demoApplied: number;
};

export function savingsSummary(ws: Workspace, asOf = today()): SavingsSummary {
  const recs = recommendations(
    current(ws, asOf),
    ws.dismissedOpportunityIds ?? [],
  );
  let potential = 0,
    demoPotential = 0,
    unpriced = 0;
  for (const r of recs) {
    if (r.savings <= 0) {
      unpriced++;
      continue;
    }
    // A personal workspace never counts illustrative demo deltas.
    if (r.illustrative && ws.mode !== "demo") continue;
    potential += r.savings;
    if (r.illustrative) demoPotential += r.savings;
  }
  let recorded = 0,
    recordedProjected = 0,
    demoApplied = 0;
  for (const o of latestOutcomes(ws.outcomes)) {
    const amount = Math.max(0, o.monthlyReduction);
    if (o.source === "demo") demoApplied += amount;
    else if (o.effectiveDate > asOf) recordedProjected += amount;
    else recorded += amount;
  }
  return {
    potential,
    demoPotential,
    opportunities: recs.length,
    unpriced,
    recorded,
    recordedProjected,
    demoApplied,
  };
}

/** `sub` carries the terms billed on `date`, which may be a scheduled plan change. */
export type Upcoming = { sub: Subscription; date: string };

export function upcoming(ws: Workspace, days: number, asOf = today()) {
  const end = addDays(asOf, days);
  return current(ws, asOf)
    .flatMap((s) => {
      const date = nextRenewal(s, asOf);
      if (!date || date > end) return [];
      const entry = billingEntries(s, date.slice(0, 7)).find(
        (e) => e.date === date,
      );
      return [{ sub: entry?.sub ?? s, date }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function scheduledInMonth(ws: Workspace, month: string): Upcoming[] {
  return ws.subscriptions
    .flatMap((s) => billingEntries(s, month))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type Decision = {
  sub: Subscription;
  verdict: Verdict;
  renewal: string | null;
  reason: "renewing" | "evidence" | "change" | "stale";
};

/** A short queue: renewals in the next week, priced or reviewable changes, stale evidence, and the largest unknown. */
export function renewalQueue(ws: Workspace, asOf = today(), limit = 6) {
  const dismissed = new Set(ws.dismissedOpportunityIds ?? []);
  const kept = ws.keptRenewals ?? {};
  const weekEnd = addDays(asOf, 7);
  const candidates = current(ws, asOf)
    .filter((s) => s.status === "active" && !s.scheduledChange)
    .map((sub) => ({ sub, v: verdict(sub), renewal: nextRenewal(sub, asOf) }))
    .filter(
      ({ sub, v, renewal }) =>
        !(v.recommendation && dismissed.has(v.recommendation.id)) &&
        !(kept[sub.id] && (!renewal || renewal <= kept[sub.id])),
    );
  const out: Decision[] = [];
  const add = (d: Decision) => {
    if (!out.some((x) => x.sub.id === d.sub.id)) out.push(d);
  };
  for (const c of candidates.filter((c) => c.renewal && c.renewal <= weekEnd))
    add({ sub: c.sub, verdict: c.v, renewal: c.renewal, reason: "renewing" });
  for (const c of candidates.filter((c) => c.v.recommendation))
    add({ sub: c.sub, verdict: c.v, renewal: c.renewal, reason: "change" });
  for (const c of candidates.filter(
    (c) =>
      c.v.kind === "needs_evidence" &&
      c.v.evidence &&
      !evidenceIsFresh(c.v.evidence, asOf),
  ))
    add({ sub: c.sub, verdict: c.v, renewal: c.renewal, reason: "stale" });
  const largestUnknown = candidates
    .filter((c) => c.v.kind === "needs_evidence")
    .sort((a, b) => monthly(b.sub) - monthly(a.sub))[0];
  if (largestUnknown)
    add({
      sub: largestUnknown.sub,
      verdict: largestUnknown.v,
      renewal: largestUnknown.renewal,
      reason: "evidence",
    });
  return out.slice(0, limit);
}

export type VisitSummary = {
  since: string;
  newSubscriptions: Subscription[];
  outcomes: RecordedOutcome[];
  priceChanges: { sub: Subscription; from: number; to: number; date: string }[];
  alerts: { sub: Subscription; text: string }[];
  completedActions: Action[];
  projectedRenewals: Upcoming[];
};

export function sinceLastVisit(
  ws: Workspace,
  previousVisitAt: string | undefined,
  asOf = today(),
): VisitSummary | null {
  if (!previousVisitAt || !Number.isFinite(Date.parse(previousVisitAt)))
    return null;
  const sinceDay = previousVisitAt.slice(0, 10);
  const priceChanges: VisitSummary["priceChanges"] = [];
  for (const sub of ws.subscriptions) {
    const charges = [...(sub.charges ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    for (let i = 1; i < charges.length; i++) {
      const prev = charges[i - 1],
        next = charges[i];
      if (next.date > sinceDay && Math.abs(next.amount - prev.amount) >= 0.01)
        priceChanges.push({
          sub,
          from: prev.amount,
          to: next.amount,
          date: next.date,
        });
    }
  }
  const projectedRenewals: Upcoming[] = [];
  if (sinceDay < asOf) {
    const months = monthsBetween(sinceDay, asOf);
    for (const s of ws.subscriptions)
      for (const m of months)
        for (const e of billingEntries(s, m))
          if (e.date > sinceDay && e.date <= asOf) projectedRenewals.push(e);
  }
  projectedRenewals.sort((a, b) => a.date.localeCompare(b.date));
  return {
    since: previousVisitAt,
    newSubscriptions: ws.subscriptions.filter(
      (s) => s.createdAt > previousVisitAt && s.source !== "Demo",
    ),
    outcomes: (ws.outcomes ?? []).filter((o) => o.recordedAt > previousVisitAt),
    priceChanges,
    alerts: ws.subscriptions.flatMap((sub) =>
      (sub.alerts ?? []).map((text) => ({ sub, text })),
    ),
    completedActions: ws.actions.filter(
      (a) =>
        a.status === "completed" && (a.completedAt ?? "") > previousVisitAt,
    ),
    projectedRenewals,
  };
}

export const visitHasNews = (v: VisitSummary | null) =>
  Boolean(
    v &&
    (v.newSubscriptions.length ||
      v.outcomes.length ||
      v.priceChanges.length ||
      v.alerts.length ||
      v.completedActions.length ||
      v.projectedRenewals.length),
  );

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const last = to.slice(0, 7);
  for (let i = 0; i < 26 && d.toISOString().slice(0, 7) <= last; i++) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/** Offers that can become an exact proposal: fresh, confirmed, cheaper and logically valid for the kind. */
export function usableOffers(sub: Subscription, kind?: PlanOffer["kind"]) {
  return (sub.offers ?? []).filter(
    (o) =>
      (!kind || o.kind === kind) &&
      offerIsFresh(o) &&
      (sub.source === "Demo" || o.provenance !== "demo") &&
      monthly(o) < monthly(sub) &&
      (o.kind !== "yearly" ||
        (sub.cycle === "monthly" && o.cycle === "yearly")) &&
      (o.kind !== "migrate" ||
        sub.hasDataToMove === true ||
        sub.source === "Demo"),
  );
}

export type ActionOption = {
  kind: ActionKind;
  available: boolean;
  reason?: string;
  offers: PlanOffer[];
};

export function actionOptions(sub: Subscription): ActionOption[] {
  const active = sub.status === "active";
  const inactive = active ? undefined : "Only active subscriptions can change.";
  const opt = (
    kind: ActionKind,
    offers: PlanOffer[],
    missing?: string,
  ): ActionOption => ({
    kind,
    offers,
    available: active && !missing,
    reason: inactive ?? missing,
  });
  const down = usableOffers(sub, "downgrade"),
    yearly = usableOffers(sub, "yearly"),
    migrate = usableOffers(sub, "migrate");
  return [
    opt("cancel", []),
    opt(
      "downgrade",
      down,
      down.length ? undefined : "Confirm a cheaper plan price first.",
    ),
    opt(
      "yearly",
      yearly,
      sub.cycle === "yearly"
        ? "Already billed annually."
        : yearly.length
          ? undefined
          : "Confirm a cheaper annual price first.",
    ),
    opt(
      "migrate",
      migrate,
      sub.source !== "Demo" && !sub.hasDataToMove
        ? "Declare the data you need to move first."
        : migrate.length
          ? undefined
          : "Confirm a cheaper alternative first.",
    ),
  ];
}

export function defaultEffectiveDate(
  sub: Subscription,
  kind: ActionKind,
  asOf = today(),
) {
  if (kind === "migrate") return asOf;
  return nextRenewal(sub, asOf) ?? asOf;
}

export const canApplyToDemo = (action: Action, ws: Workspace) => {
  const sub = ws.subscriptions.find((s) => s.id === action.subscriptionId);
  return (
    action.status === "completed" &&
    !action.appliedAt &&
    ws.mode === "demo" &&
    sub?.source === "Demo"
  );
};

export const PROPOSAL_STATES: Action["status"][] = ["awaiting_approval"];
export const RETRYABLE_STATES: Action["status"][] = [
  "failed",
  "expired",
  "discarded",
  "superseded",
];

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Recent conversation sent to the server; older turns and long messages are trimmed. */
export function boundHistory(
  turns: ChatTurn[],
  maxTurns = 12,
  maxChars = 2000,
): ChatTurn[] {
  return turns
    .filter((t) => t.content.trim())
    .slice(-maxTurns)
    .map((t) => ({
      role: t.role,
      content:
        t.content.length > maxChars ? t.content.slice(0, maxChars) : t.content,
    }));
}

export type ChatLink = { label: string; subscriptionId: string };

/** Keep only links that point to a subscription in this workspace; labels are plain text. */
export function safeLinks(links: unknown, subs: Subscription[]): ChatLink[] {
  if (!Array.isArray(links)) return [];
  const ids = new Set(subs.map((s) => s.id));
  const seen = new Set<string>();
  const out: ChatLink[] = [];
  for (const l of links) {
    if (!l || typeof l !== "object") continue;
    const { label, subscriptionId } = l as Record<string, unknown>;
    if (typeof subscriptionId !== "string" || !ids.has(subscriptionId))
      continue;
    if (seen.has(subscriptionId)) continue;
    seen.add(subscriptionId);
    const name = subs.find((s) => s.id === subscriptionId)!.name;
    out.push({
      subscriptionId,
      label:
        typeof label === "string" && label.trim()
          ? label.trim().slice(0, 80)
          : name,
    });
    if (out.length >= 5) break;
  }
  return out;
}

export const categoriesPresent = (subs: Subscription[]): Category[] =>
  [...new Set(subs.map((s) => s.category))].sort();

export type SortKey = "renewal" | "cost" | "name";
export type SortDir = "asc" | "desc";

export function sortSubscriptions(
  subs: Subscription[],
  key: SortKey,
  dir: SortDir,
  asOf = today(),
) {
  const sign = dir === "asc" ? 1 : -1;
  const renewal = (s: Subscription) => nextRenewal(s, asOf) ?? "9999-12-31";
  return [...subs].sort((a, b) => {
    const n =
      key === "cost"
        ? monthly(a) - monthly(b)
        : key === "name"
          ? a.name.localeCompare(b.name)
          : renewal(a).localeCompare(renewal(b));
    return n * sign || a.name.localeCompare(b.name);
  });
}

/** A quoted CSV cell that spreadsheets will not evaluate as a formula. */
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

export function subscriptionsCsv(subs: Subscription[], asOf = today()) {
  return [
    "merchant,plan,amount,cycle,next_renewal,category,status,end_date",
    ...subs.map((s) =>
      [
        s.name,
        s.plan,
        s.price.toFixed(2),
        s.cycle,
        nextRenewal(s, asOf) ?? "",
        s.category,
        s.status,
        s.endDate ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}

export function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:"
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}

const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** The merchant's own site, only when the subscription has a real domain. Never guessed. */
export function merchantSite(sub: Pick<Subscription, "domain">) {
  const host = sub.domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0];
  return DOMAIN.test(host) ? `https://${host}` : undefined;
}

export const statusLabel = (s: Subscription, asOf = today()) =>
  s.status === "unconfirmed"
    ? "Needs confirmation"
    : !isCurrent(s, asOf)
      ? "Cancelled"
      : s.status === "cancel_pending"
        ? "Ends"
        : s.scheduledChange
          ? "Plan change"
          : "Active";
