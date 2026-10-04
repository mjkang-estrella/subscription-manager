import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspace,
  nextRenewal,
  billingInMonth,
  billingEntries,
  isCurrent,
  verdict,
  recommendations,
  today,
  monthly,
} from "../shared/domain.js";
import { recordOutcome, migrateWorkspace } from "../shared/lifecycle.js";
import { exportBackup, importBackup } from "../shared/backup.js";
import { calendarFeed } from "../server/calendar.js";
const personal = () => {
  const d = createWorkspace();
  d.mode = "personal";
  d.subscriptions = d.subscriptions
    .slice(0, 1)
    .map((s) => ({ ...s, source: "Manual" as const, offers: [] }));
  return d;
};
test("forecasts roll forward and clamp without creating transactions", () => {
  const d = personal(),
    s = d.subscriptions[0];
  s.nextBilling = "2024-01-31";
  assert.equal(nextRenewal(s, "2024-02-01"), "2024-02-29");
  assert.equal(nextRenewal(s, "2024-03-01"), "2024-03-31");
  assert.equal(
    nextRenewal(
      { ...s, cycle: "yearly", nextBilling: "2024-02-29" },
      "2025-01-01",
    ),
    "2025-02-28",
  );
  migrateWorkspace(d);
  assert.equal(s.charges?.length, 0);
});
test("pending cancellation excludes a renewal on its end date", () => {
  const d = personal(),
    s = d.subscriptions[0];
  s.nextBilling = "2099-10-09";
  recordOutcome(d, s.id, { kind: "cancel", effectiveDate: "2099-10-09" });
  assert.equal(s.status, "cancel_pending");
  assert.equal(nextRenewal(s, "2099-10-01"), null);
  assert.equal(billingInMonth(s, "2099-10"), null);
  assert.equal(isCurrent(s, "2099-10-08"), true);
  assert.equal(isCurrent(s, "2099-10-09"), true);
  assert.equal(isCurrent(s, "2099-10-10"), false);
  migrateWorkspace(d, "2099-10-09");
  assert.equal(s.status, "cancel_pending");
  migrateWorkspace(d, "2099-10-10");
  assert.equal(s.status, "cancelled");
});
test("editing a pending cancellation cannot double count its recorded reduction", () => {
  const d = personal(),
    s = d.subscriptions[0];
  recordOutcome(d, s.id, { kind: "cancel", effectiveDate: "2099-10-09" });
  recordOutcome(d, s.id, { kind: "cancel", effectiveDate: "2099-11-09" });
  assert.equal(d.outcomes?.[0].monthlyReduction, monthly(s));
});
test("plan changes stay scheduled until the approved effective date", () => {
  const d = personal(),
    s = d.subscriptions[0],
    price = s.price;
  recordOutcome(d, s.id, {
    kind: "plan",
    effectiveDate: "2099-10-09",
    plan: "Lite",
    price: 5,
    cycle: "monthly",
    nextBilling: "2099-10-09",
  });
  assert.equal(s.price, price);
  assert.equal(s.scheduledChange?.price, 5);
  migrateWorkspace(d, "2099-10-09");
  assert.equal(s.price, 5);
  assert.equal(s.scheduledChange, undefined);
});
test("demo application cannot write personal data", () => {
  const d = personal();
  assert.throws(
    () =>
      recordOutcome(
        d,
        d.subscriptions[0].id,
        { kind: "cancel", effectiveDate: today() },
        "demo",
      ),
    /demo/,
  );
  assert.equal(d.outcomes?.length, 0);
});
test("same-day evidence selection and citations use the deciding record", () => {
  const d = personal(),
    s = d.subscriptions[0];
  s.evidence = [
    {
      id: "old",
      source: "Account activity",
      summary: "Unused",
      usage: 0,
      observedAt: today(),
      confidence: "High",
    },
    {
      id: "new",
      source: "Check-in",
      summary: "Shared family value",
      wouldRenew: true,
      value: "shared",
      observedAt: today(),
      confidence: "Medium",
    },
    {
      id: "receipt",
      source: "Receipt",
      summary: "Paid",
      observedAt: today(),
      confidence: "High",
    },
  ];
  assert.equal(verdict(s).kind, "keep");
  assert.equal(verdict(s).evidence?.id, "new");
  assert.equal(recommendations([s]).length, 0);
  s.evidence = s.evidence.filter((e) => e.id !== "new");
  assert.equal(recommendations([s])[0].evidenceId, "old");
});
test("partial browser evidence and stale prices produce no invented savings", () => {
  const d = personal(),
    s = d.subscriptions[0];
  s.evidence = [
    {
      id: "browser",
      source: "Browser activity",
      summary: "No browser visits",
      usage: 0,
      observedAt: today(),
      confidence: "Low",
    },
  ];
  assert.equal(verdict(s).kind, "needs_evidence");
  assert.equal(recommendations([s]).length, 0);
  s.evidence = [
    {
      id: "real",
      source: "Self-reported",
      summary: "One credit of 100",
      usage: 1,
      limit: 100,
      metric: "quota",
      observedAt: today(),
      confidence: "Medium",
    },
  ];
  s.offers = [
    {
      id: "offer",
      kind: "downgrade",
      plan: "Lite",
      price: 4,
      cycle: "monthly",
      provenance: "user",
      checkedAt: "2020-01-01T00:00:00Z",
      confirmedAt: "2020-01-01T00:00:00Z",
      capabilityLoss: "Fewer credits",
    },
  ];
  assert.equal(recommendations([s])[0].savings, 0);
  s.offers[0].checkedAt = new Date().toISOString();
  assert.equal(recommendations([s])[0].savings, monthly(s) - 4);
});
test("backup preserves evidence and outcomes but strips capabilities and executable approvals", () => {
  const d = personal(),
    s = d.subscriptions[0];
  recordOutcome(d, s.id, { kind: "cancel", effectiveDate: "2099-01-01" });
  const raw = d as unknown as Record<string, unknown>;
  raw.recoveryCode = "secret";
  const backup = exportBackup(d);
  assert.equal("recoveryCode" in backup.workspace, false);
  const restored = importBackup(backup);
  assert.deepEqual(restored.outcomes, d.outcomes);
  assert.deepEqual(restored.subscriptions[0].evidence, s.evidence);
  assert.throws(() => importBackup({ ...backup, version: 3 }));
  const duplicate = structuredClone(backup);
  duplicate.workspace.subscriptions.push(duplicate.workspace.subscriptions[0]);
  assert.throws(() => importBackup(duplicate), /unique/);
});
test("calendar uses date-only renewal entries, no private notes, and excludes cancellation", () => {
  const d = personal(),
    s = d.subscriptions[0];
  s.nextBilling = "2099-01-31";
  s.notes = "PRIVATE NOTE";
  s.name = "Name, with; separators";
  s.id = "untrusted\r\nBEGIN:VEVENT";
  const ics = calendarFeed(d, "2099-01-01");
  assert.match(ics, /DTSTART;VALUE=DATE:20990228/);
  assert.match(ics, /Name\\, with\\; separators/);
  assert(!ics.includes("PRIVATE NOTE"));
  assert(!ics.includes("untrusted"));
  assert(!ics.includes(s.evidence[0].summary));
  assert.match(ics, /TRIGGER:-P1D/);
  for (const line of ics.split("\r\n")) assert(Buffer.byteLength(line) <= 75);
  s.status = "cancel_pending";
  s.endDate = "2099-01-31";
  assert(!calendarFeed(d, "2099-01-01").includes("BEGIN:VEVENT"));
});

test("scheduled billing uses approved target terms and suppresses superseded renewal", () => {
  const d = personal(),
    s = d.subscriptions[0];
  s.nextBilling = "2099-10-09";
  recordOutcome(d, s.id, {
    kind: "plan",
    effectiveDate: "2099-10-09",
    plan: "Annual",
    price: 48,
    cycle: "yearly",
    nextBilling: "2099-10-09",
  });
  const entries = billingEntries(s, "2099-10");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, "2099-10-09");
  assert.equal(entries[0].sub.price, 48);
  assert.equal(billingEntries(s, "2099-11").length, 0);
  const ics = calendarFeed(d, "2099-10-01");
  assert.match(ics, /48/);
  assert(!ics.includes("DTSTART;VALUE=DATE:20991109"));
});

test("active use never recommends migration just because its target is cheaper", () => {
  const d = createWorkspace();
  for (const id of ["notion", "icloud", "github"]) {
    const s = d.subscriptions.find((x) => x.id === id)!;
    assert.notEqual(verdict(s).kind, "migrate");
    s.offers = s.offers?.filter((o) => o.kind === "migrate");
    assert.equal(verdict(s).kind, "keep");
    s.evidence = [
      {
        id: "low",
        source: "Account activity",
        summary: "One use of fifty",
        usage: 1,
        limit: 50,
        metric: "uses",
        observedAt: today(),
        confidence: "High",
      },
    ];
    assert.equal(verdict(s).kind, "migrate");
  }
});

test("corrections retain the original reduction baseline", () => {
  const d = personal(),
    s = d.subscriptions[0];
  s.price = 20;
  s.cycle = "monthly";
  const change = {
    kind: "plan" as const,
    effectiveDate: today(),
    plan: "Basic",
    price: 10,
    cycle: "monthly" as const,
    nextBilling: today(),
  };
  recordOutcome(d, s.id, change);
  recordOutcome(d, s.id, { ...change, price: 5 });
  assert.equal(d.outcomes![0].monthlyReduction, 15);
  assert.equal(d.outcomes!.at(-1)!.before.price, 20);
});
