import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspace,
  monthly,
  billingInMonth,
  utilization,
  recommendations,
  today,
} from "../shared/domain";
import { parseImport, subscriptionSchema } from "../server/imports";
import { merchantFixture } from "../server/browser";
import type { Action } from "../shared/types";
const base = () => ({ ...createWorkspace().subscriptions[0] });
test("annual plans normalize without charging every month", () => {
  const s = {
    ...base(),
    price: 120,
    cycle: "yearly" as const,
    nextBilling: "2026-10-12",
  };
  assert.equal(monthly(s), 10);
  assert.equal(billingInMonth(s, "2026-10"), "2026-10-12");
  assert.equal(billingInMonth(s, "2026-11"), null);
  assert.equal(billingInMonth(s, "2027-10"), "2027-10-12");
  assert.equal(billingInMonth(s, "2025-10"), null);
});
test("billing dates clamp to month end and cancelled plans stop", () => {
  const s = { ...base(), nextBilling: "2026-01-31" };
  assert.equal(billingInMonth(s, "2026-02"), "2026-02-28");
  assert.equal(billingInMonth({ ...s, status: "cancelled" }, "2026-02"), null);
});
test("missing evidence never becomes unused", () => {
  const s = { ...base(), evidence: [] };
  assert.equal(utilization(s).label, "Unknown");
  assert.deepEqual(recommendations([s]), []);
});
test("browser-only inactivity never recommends cancellation", () => {
  const s = base();
  s.evidence = [
    {
      id: "x",
      source: "Browser activity",
      summary: "No browser visits",
      observedAt: today(),
      usage: 0,
      days: 30,
      confidence: "Low",
    },
  ];
  assert.equal(utilization(s).label, "No visits observed");
  assert.deepEqual(recommendations([s]), []);
});
test("stale evidence does not generate savings recommendations", () => {
  const s = base();
  s.evidence = [
    {
      id: "x",
      source: "Account activity",
      summary: "No usage",
      observedAt: "2020-01-01",
      usage: 0,
      confidence: "High",
    },
  ];
  assert.equal(utilization(s).label, "Needs refresh");
  assert.deepEqual(recommendations([s]), []);
});
test("live downgrade pricing is not invented", () => {
  const s = { ...base(), source: "Manual" as const };
  s.evidence = [
    {
      id: "x",
      source: "Self-reported",
      summary: "1 of 100 credits",
      observedAt: today(),
      usage: 1,
      limit: 100,
      confidence: "Medium",
    },
  ];
  assert.equal(recommendations([s])[0].savings, 0);
});
test("import groups repeated charges and flags uncertain candidates", async () => {
  const rows = await parseImport(
    "merchant,amount,date,currency\nExample,12,2026-08-09,USD\nExample,12,2026-09-09,USD\nOther,9,2026-09-01,EUR\nSingle,5,2026-09-12,USD",
    "csv",
  );
  assert.equal(rows.length, 2);
  assert.match(rows[0].notes, /2 charges/);
  assert.match(rows[1].notes, /One charge/);
  assert(rows[0].nextBilling >= today());
});
test("invalid calendar dates and negative prices are rejected", () => {
  const s = base();
  assert.equal(
    subscriptionSchema.safeParse({ ...s, nextBilling: "2026-02-31" }).success,
    false,
  );
  assert.equal(
    subscriptionSchema.safeParse({ ...s, price: -1 }).success,
    false,
  );
});
test("sandbox escapes merchant content and keeps independent state", () => {
  const s = { ...base(), name: "<script>alert(1)</script>" };
  const a = {
    fromPlan: "Premium",
    fromPrice: 12,
    fromCycle: "monthly",
    toPlan: "Cancelled",
    toPrice: 0,
    toCycle: "monthly",
    kind: "cancel",
    consequence: "End test plan",
  } as Action;
  const html = merchantFixture(s, a);
  assert(html.includes("&lt;script&gt;"));
  assert(!html.includes("<script>alert(1)</script>"));
  assert(html.includes("window.accountState"));
  assert(html.includes("NO REAL BILLING"));
});

test("an account page without explicit metrics stays unknown", () => {
  const s = base();
  s.evidence = [
    {
      id: "x",
      source: "Account activity",
      summary: "No usage metrics shown on this page",
      observedAt: today(),
      confidence: "Low",
    },
  ];
  assert.equal(utilization(s).label, "Unknown");
  assert.deepEqual(recommendations([s]), []);
});

test("reverse chronological CSV keeps the latest charge amount", async () => {
  const rows = await parseImport(
    "merchant,amount,date\nExample,15,2026-10-01\nExample,10,2026-09-01",
    "csv",
  );
  assert.equal(rows[0].price, 15);
});
