import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspace,
  isCurrent,
  billingInMonth,
  nextRenewal,
  recommendations,
  money,
} from "../shared/domain.js";
import { exportBackup, importBackup } from "../shared/backup.js";
import { current as currentSubs, scheduledInMonth } from "../src/model.js";

test("uncertain billing history never becomes recurring spending or savings", () => {
  const workspace = createWorkspace();
  const historical = {
    ...workspace.subscriptions[0],
    status: "unconfirmed" as const,
    nextBilling: "2020-01-01",
    price: 8000,
    currency: "KRW" as const,
  };
  workspace.subscriptions = [historical];
  assert.equal(isCurrent(historical), false);
  assert.equal(nextRenewal(historical), null);
  assert.equal(billingInMonth(historical, "2026-10"), null);
  assert.deepEqual(currentSubs(workspace), []);
  assert.deepEqual(scheduledInMonth(workspace, "2026-10"), []);
  assert.deepEqual(recommendations([historical]), []);
});

test("reviewed history backups preserve source links, currency and unknown prices", () => {
  const workspace = createWorkspace();
  workspace.mode = "personal";
  workspace.subscriptions = [
    {
      ...workspace.subscriptions[0],
      source: "Email",
      status: "unconfirmed",
      currency: "KRW",
      price: 0,
      priceKnown: false,
      billingNote: "Current price not present in receipt",
      evidence: [
        {
          id: "receipt",
          source: "Receipt",
          summary: "Billing notice",
          confidence: "High",
          observedAt: "2026-10-01",
          sourceUrl: "https://app.hey.com/topics/123",
        },
      ],
      charges: [
        {
          id: "charge",
          date: "2026-09-01",
          amount: 229000,
          currency: "KRW",
          source: "Email",
          sourceUrl: "https://app.hey.com/topics/456",
        },
      ],
    },
  ];
  const restored = importBackup(exportBackup(workspace));
  assert.deepEqual(restored.subscriptions, workspace.subscriptions);
  assert.equal(money(229000, "KRW"), "₩229,000");
  const invalid = exportBackup(workspace);
  invalid.workspace.subscriptions[0].evidence[0].sourceUrl =
    "javascript:alert(1)";
  assert.throws(() => importBackup(invalid));
});

import { recordOutcome } from "../shared/lifecycle.js";
test("ending uncertain history cannot claim an unverified savings baseline", () => {
  const ws = createWorkspace();
  ws.mode = "personal";
  ws.subscriptions = [
    {
      ...ws.subscriptions[0],
      source: "Email",
      status: "unconfirmed",
      price: 120,
    },
  ];
  const o = recordOutcome(ws, ws.subscriptions[0].id, {
    kind: "cancel",
    effectiveDate: "2026-01-01",
  });
  assert.equal(o.monthlyReduction, 0);
});

test("currency formatting ignores summation noise at the half-cent boundary", () => {
  assert.equal(money(10.004999999999999), "$10.01");
  assert.equal(money(10.005000000000003), "$10.01");
});
