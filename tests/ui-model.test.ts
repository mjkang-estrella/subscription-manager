import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace, nextRenewal, today } from "../shared/domain";
import type {
  PlanOffer,
  RecordedOutcome,
  Subscription,
  Workspace,
} from "../shared/types";
import type { ImportCandidate } from "../shared/discovery";
import {
  actionOptions,
  addDays,
  boundHistory,
  csvCell,
  latestOutcomes,
  merchantSite,
  renewalQueue,
  safeHttpUrl,
  safeLinks,
  savingsSummary,
  scheduledInMonth,
  sortSubscriptions,
  subscriptionsCsv,
  upcoming,
} from "../src/model";
import { candidateProblems, suggestedSign } from "../src/ImportFlow";
import { offerProblem } from "../src/AlternativesPanel";

const now = today();
const sub = (over: Partial<Subscription> = {}): Subscription => ({
  ...createWorkspace().subscriptions[0],
  offers: [],
  evidence: [],
  ...over,
});
const outcome = (over: Partial<RecordedOutcome>): RecordedOutcome => {
  const terms = {
    plan: "Pro",
    price: 20,
    cycle: "monthly" as const,
    status: "active" as const,
    nextBilling: now,
  };
  return {
    id: "o",
    subscriptionId: "s1",
    subscriptionName: "Service",
    source: "manual",
    kind: "plan",
    before: terms,
    after: { ...terms, price: 10 },
    effectiveDate: now,
    recordedAt: `${now}T10:00:00.000Z`,
    monthlyReduction: 10,
    ...over,
  };
};
const offer = (over: Partial<PlanOffer>): PlanOffer => ({
  id: "offer",
  kind: "downgrade",
  plan: "Basic",
  price: 1,
  cycle: "monthly",
  checkedAt: new Date().toISOString(),
  confirmedAt: new Date().toISOString(),
  provenance: "user",
  capabilityLoss: "",
  ...over,
});
const ws = (over: Partial<Workspace>): Workspace => ({
  ...createWorkspace(),
  ...over,
});

test("latest outcome wins per subscription and source; first wins on ties", () => {
  const list = [
    outcome({ id: "newer", recordedAt: `${now}T12:00:00.000Z`, monthlyReduction: 15 }),
    outcome({ id: "tie-first", recordedAt: `${now}T11:00:00.000Z` }),
    outcome({ id: "older", recordedAt: `${now}T09:00:00.000Z` }),
    outcome({ id: "demo", source: "demo", recordedAt: `${now}T08:00:00.000Z` }),
  ];
  assert.deepEqual(
    latestOutcomes(list).map((o) => o.id),
    ["newer", "demo"],
  );
  const tied = [
    outcome({ id: "first" }),
    outcome({ id: "second" }),
  ];
  assert.deepEqual(latestOutcomes(tied).map((o) => o.id), ["first"]);
});

test("savings separate recorded, future, and demo-ledger reductions without double counting corrections", () => {
  const s = savingsSummary(
    ws({
      mode: "personal",
      subscriptions: [],
      outcomes: [
        outcome({ id: "fix", recordedAt: `${now}T12:00:00.000Z`, monthlyReduction: 12 }),
        outcome({ id: "orig", recordedAt: `${now}T09:00:00.000Z`, monthlyReduction: 10 }),
        outcome({ id: "later", subscriptionId: "s2", effectiveDate: addDays(now, 10), monthlyReduction: 5 }),
        outcome({ id: "demo", subscriptionId: "s3", source: "demo", monthlyReduction: 7 }),
      ],
    }),
  );
  assert.equal(s.recorded, 12);
  assert.equal(s.recordedProjected, 5);
  assert.equal(s.demoApplied, 7);
});

test("personal workspaces never count illustrative demo deltas as potential savings", () => {
  const demo = createWorkspace();
  const personal = savingsSummary({ ...demo, mode: "personal" });
  const asDemo = savingsSummary({ ...demo, mode: "demo" });
  assert.equal(personal.potential, asDemo.potential - asDemo.demoPotential);
});

test("renewal queue drops dismissed suggestions and kept renewals until the next cycle", () => {
  const base = createWorkspace();
  const queue = renewalQueue(base);
  assert.ok(queue.length > 0 && queue.length <= 6);
  const first = queue[0];
  const dismissed = first.verdict.recommendation
    ? [first.verdict.recommendation.id]
    : [];
  const renewal = nextRenewal(first.sub);
  const kept = renewalQueue({
    ...base,
    dismissedOpportunityIds: dismissed,
    keptRenewals: renewal ? { [first.sub.id]: renewal } : {},
  });
  if (renewal || dismissed.length)
    assert.ok(!kept.some((d) => d.sub.id === first.sub.id && d.reason === first.reason));
  const expired = renewalQueue({
    ...base,
    keptRenewals: { [first.sub.id]: addDays(now, -400) },
  });
  assert.ok(expired.some((d) => d.sub.id === first.sub.id));
});

test("calendar entries follow billingEntries and upcoming stays within the window", () => {
  const s = sub({ id: "m", nextBilling: now, cycle: "monthly", status: "active" });
  const month = now.slice(0, 7);
  const entries = scheduledInMonth(ws({ subscriptions: [s] }), month);
  assert.deepEqual(entries.map((e) => e.date), [now]);
  const soon = upcoming(ws({ subscriptions: [s, sub({ id: "far", nextBilling: addDays(now, 90) })] }), 30);
  assert.deepEqual(soon.map((u) => u.sub.id), ["m"]);
});

test("chat history keeps the last twelve non-empty turns and trims long messages", () => {
  const turns = Array.from({ length: 20 }, (_, i) => ({
    role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
    content: i === 19 ? "x".repeat(3000) : i === 18 ? "  " : `turn ${i}`,
  }));
  const out = boundHistory(turns);
  assert.equal(out.length, 12);
  assert.equal(out[0].content, "turn 7");
  assert.equal(out.at(-1)!.content.length, 2000);
  assert.ok(!out.some((t) => !t.content.trim()));
});

test("chat links only target subscriptions in this workspace", () => {
  const subs = [sub({ id: "a", name: "Alpha" }), sub({ id: "b", name: "Beta" })];
  const links = safeLinks(
    [
      { subscriptionId: "a", label: "  Open Alpha " },
      { subscriptionId: "a", label: "dupe" },
      { subscriptionId: "zzz", label: "foreign" },
      { subscriptionId: "b" },
      { href: "javascript:alert(1)" },
      "bad",
    ],
    subs,
  );
  assert.deepEqual(links, [
    { subscriptionId: "a", label: "Open Alpha" },
    { subscriptionId: "b", label: "Beta" },
  ]);
  assert.deepEqual(safeLinks("nope", subs), []);
});

test("CSV export neutralizes spreadsheet formulas and quotes cells", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
  assert.equal(csvCell("-2+3"), `"'-2+3"`);
  assert.equal(csvCell('say "hi"'), `"say ""hi"""`);
  const csv = subscriptionsCsv([sub({ name: "@evil", plan: "+x" })]);
  assert.ok(csv.split("\n")[1].startsWith(`"'@evil","'+x"`));
});

test("sorting by cost uses the monthly equivalent", () => {
  const list = [
    sub({ id: "y", name: "Yearly", price: 120, cycle: "yearly" }),
    sub({ id: "m", name: "Monthly", price: 15, cycle: "monthly" }),
  ];
  assert.deepEqual(sortSubscriptions(list, "cost", "desc").map((s) => s.id), ["m", "y"]);
  assert.deepEqual(sortSubscriptions(list, "name", "asc").map((s) => s.id), ["m", "y"]);
});

test("action options require a fresh, cheaper, logically valid offer", () => {
  const monthlySub = sub({ status: "active", cycle: "monthly", price: 20, source: "Manual", hasDataToMove: false });
  const none = actionOptions(monthlySub);
  assert.equal(none.find((o) => o.kind === "cancel")!.available, true);
  assert.equal(none.find((o) => o.kind === "downgrade")!.available, false);
  assert.equal(none.find((o) => o.kind === "migrate")!.reason, "Declare the data you need to move first.");

  const withOffers = actionOptions({
    ...monthlySub,
    hasDataToMove: true,
    offers: [
      offer({ id: "d", kind: "downgrade", price: 10 }),
      offer({ id: "y", kind: "yearly", price: 180, cycle: "yearly" }),
      offer({ id: "y-bad", kind: "yearly", price: 5, cycle: "monthly" }),
      offer({ id: "m", kind: "migrate", price: 8 }),
      offer({ id: "stale", kind: "downgrade", price: 5, checkedAt: "2020-01-01T00:00:00.000Z" }),
      offer({ id: "unconfirmed", kind: "downgrade", price: 5, confirmedAt: undefined }),
      offer({ id: "pricier", kind: "downgrade", price: 25 }),
      offer({ id: "demo-terms", kind: "downgrade", price: 5, provenance: "demo" }),
    ],
  });
  const by = (k: string) => withOffers.find((o) => o.kind === k)!;
  assert.deepEqual(by("downgrade").offers.map((o) => o.id), ["d"]);
  assert.deepEqual(by("yearly").offers.map((o) => o.id), ["y"]);
  assert.deepEqual(by("migrate").offers.map((o) => o.id), ["m"]);
  assert.ok(withOffers.every((o) => o.available));

  const yearlySub = actionOptions({ ...monthlySub, cycle: "yearly", price: 240 });
  assert.equal(yearlySub.find((o) => o.kind === "yearly")!.reason, "Already billed annually.");
  const ended = actionOptions({ ...monthlySub, status: "cancel_pending" });
  assert.ok(ended.every((o) => !o.available));
});

test("offer form rejects terms that would never be suggested", () => {
  const s = sub({ price: 20, cycle: "monthly" });
  assert.equal(offerProblem(s, { kind: "downgrade", price: 10, cycle: "monthly" }), undefined);
  assert.match(offerProblem(s, { kind: "downgrade", price: 25, cycle: "monthly" })!, /Not cheaper/);
  assert.match(offerProblem(s, { kind: "yearly", price: 100, cycle: "monthly" })!, /billed yearly/);
  assert.match(
    offerProblem({ ...s, cycle: "yearly", price: 240 }, { kind: "yearly", price: 100, cycle: "yearly" })!,
    /already billed annually/,
  );
});

test("import review blocks candidates the server would reject", () => {
  const c = {
    id: "c",
    name: "Netflix",
    plan: "Standard",
    price: 0,
    cycle: "monthly",
    nextBilling: now,
    category: "Entertainment",
    domain: "netflix.com",
    requiresReview: ["price", "currency"],
  } as unknown as ImportCandidate;
  assert.deepEqual(candidateProblems(c), ["its amount", "USD confirmed"]);
  assert.deepEqual(candidateProblems({ ...c, requiresReview: ["cycle"] }), ["a confirmed billing cycle"]);
  assert.deepEqual(candidateProblems({ ...c, requiresReview: ["cycle"], reviewedFields: ["cycle"] }), []);
  assert.deepEqual(
    candidateProblems({ ...c, reviewedFields: ["price", "currency"] }),
    [],
  );
  assert.deepEqual(candidateProblems({ ...c, requiresReview: [], name: " ", nextBilling: "03/04" }), [
    "a name",
    "a next date",
  ]);
});

test("import preselects negative charges when most sample amounts are negative", () => {
  const sample = (amounts: string[]) => amounts.map((Amount) => ({ Amount }));
  assert.equal(suggestedSign({ sample: sample(["-15.49", "-11.99", "4.00"]), mapping: { amount: "Amount" } }), "negative");
  assert.equal(suggestedSign({ sample: sample(["($9.99)", "(12.00)"]), mapping: { amount: "Amount" } }), "negative");
  assert.equal(suggestedSign({ sample: sample(["15.49", "-3.00"]), mapping: { amount: "Amount" } }), "positive");
  assert.equal(suggestedSign({ sample: sample(["-1"]), mapping: { amount: "Amount", debit: "Debit" } }), "positive");
});

test("links open only http(s) URLs and real merchant domains", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), undefined);
  assert.equal(safeHttpUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(merchantSite({ domain: "https://Netflix.com/account" }), "https://netflix.com");
  assert.equal(merchantSite({ domain: "manual-entry" }), undefined);
});
