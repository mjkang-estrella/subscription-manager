import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace } from "../shared/domain.js";
import { publicHistory } from "../shared/publication.js";

test("public snapshots retain billing facts without private workspace or email data", () => {
  const workspace = createWorkspace();
  const sub = workspace.subscriptions[0];
  sub.notes = "Private account note";
  sub.charges = [
    {
      id: "private-message-id",
      date: "2026-10-01",
      amount: 12,
      currency: "USD",
      source: "Email",
      sourceUrl: "https://app.hey.com/topics/123",
      description: "Private receipt metadata",
    },
  ];
  sub.evidence = [
    {
      id: "private-evidence",
      source: "Receipt",
      observedAt: "2026-10-01",
      confidence: "High",
      summary: "Private message",
      sourceUrl: "https://app.hey.com/topics/123",
    },
  ];
  const before = structuredClone(workspace);
  const result = publicHistory(workspace, "2026-10-04T00:00:00.000Z");
  assert.deepEqual(workspace, before);
  assert.equal(result.subscriptions.length, workspace.subscriptions.length);
  assert.equal(result.subscriptions[0].charges?.[0].amount, 12);
  assert.equal(result.subscriptions[0].charges?.[0].date, "2026-10-01");
  assert.equal(result.subscriptions[0].notes, "");
  assert.deepEqual(result.subscriptions[0].evidence, []);
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-|Private |app\.hey|actions|liveViewUrl|outcomes/,
  );
  assert.deepEqual(Object.keys(result).sort(), [
    "publishedAt",
    "subscriptions",
  ]);
});
