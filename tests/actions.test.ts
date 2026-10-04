import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace, nextRenewal, today } from "../shared/domain.js";
import { prepareAction, claimApproval } from "../server/actions.js";
import {
  migrateWorkspace,
  subscriptionFingerprint,
} from "../shared/lifecycle.js";
import { exportBackup, importBackup } from "../shared/backup.js";

test("proposals bind an exact offer and period-end default, with duplicate approval rejected", () => {
  const d = createWorkspace(),
    s = d.subscriptions.find((s) => s.id === "figma")!;
  const a = prepareAction(d, {
    subscriptionId: s.id,
    kind: "downgrade",
    offerId: s.offers![0].id,
  });
  assert.equal(a.toPrice, 9);
  assert.equal(a.effectiveDate, nextRenewal(s));
  assert.equal(a.status, "awaiting_approval");
  claimApproval(d, a.id);
  assert.equal(a.status, "running");
  assert.throws(() => claimApproval(d, a.id), /no longer/);
  assert.throws(
    () => prepareAction(d, { subscriptionId: s.id, kind: "cancel" }),
    /already running/,
  );
});
test("concurrent proposals cannot both run, and changed terms or offers require fresh approval", () => {
  const d = createWorkspace();
  const a = prepareAction(d, { subscriptionId: "adobe", kind: "cancel" });
  const b = prepareAction(d, { subscriptionId: "adobe", kind: "cancel" });
  claimApproval(d, a.id);
  assert.throws(() => claimApproval(d, b.id), /already running/);
  a.status = "failed";
  d.subscriptions.find((s) => s.id === "adobe")!.price = 40;
  assert.throws(() => claimApproval(d, b.id), /terms changed/);
  const c = prepareAction(d, { subscriptionId: "figma", kind: "downgrade" });
  d.subscriptions.find((s) => s.id === "figma")!.offers![0].price = 8;
  assert.throws(() => claimApproval(d, c.id), /terms changed/);
});
test("expiry, withdrawn proposals and restored history cannot execute", () => {
  const d = createWorkspace();
  const a = prepareAction(d, { subscriptionId: "adobe", kind: "cancel" });
  a.expiresAt = "2000-01-01T00:00:00Z";
  migrateWorkspace(d);
  assert.equal(a.status, "expired");
  assert.throws(() => claimApproval(d, a.id), /no longer/);
  const b = prepareAction(d, { subscriptionId: "figma", kind: "cancel" });
  b.status = "discarded";
  assert.throws(() => claimApproval(d, b.id), /no longer/);
  const c = prepareAction(d, { subscriptionId: "notion", kind: "cancel" });
  const restored = importBackup(exportBackup(d));
  assert.equal(
    restored.actions.find((x) => x.id === c.id)!.status,
    "historical",
  );
  assert.throws(() => claimApproval(restored, c.id), /no longer/);
});
test("invalid annual, no-data migration, unconfirmed personal, stale and more expensive offers are rejected", () => {
  const d = createWorkspace();
  assert.throws(
    () => prepareAction(d, { subscriptionId: "github", kind: "yearly" }),
    /monthly/,
  );
  assert.throws(
    () => prepareAction(d, { subscriptionId: "spotify", kind: "migrate" }),
    /data to move/,
  );
  const s = d.subscriptions.find((s) => s.id === "figma")!;
  s.source = "Manual";
  assert.throws(
    () =>
      prepareAction(d, {
        subscriptionId: s.id,
        kind: "downgrade",
        offerId: s.offers![0].id,
      }),
    /fresh target/,
  );
  const o = s.offers![0];
  o.provenance = "user";
  o.price = 20;
  assert.throws(
    () =>
      prepareAction(d, {
        subscriptionId: s.id,
        kind: "downgrade",
        offerId: o.id,
      }),
    /cheaper/,
  );
  o.price = 9;
  o.checkedAt = "2000-01-01T00:00:00Z";
  assert.throws(
    () =>
      prepareAction(d, {
        subscriptionId: s.id,
        kind: "downgrade",
        offerId: o.id,
      }),
    /fresh target/,
  );
  o.checkedAt = new Date().toISOString();
  assert.equal(
    prepareAction(d, { subscriptionId: s.id, kind: "downgrade", offerId: o.id })
      .toPrice,
    9,
  );
  assert.throws(
    () =>
      prepareAction(d, {
        subscriptionId: s.id,
        kind: "cancel",
        effectiveDate: "2000-01-01",
      }),
    /future/,
  );
  assert.equal(
    prepareAction(d, { subscriptionId: "notion", kind: "migrate" })
      .effectiveDate,
    today(),
  );
});

test("old demo offers refresh without mutating personal or approved terms", () => {
  const d = createWorkspace();
  const old = new Date(Date.now() - 31 * 86400000).toISOString();
  const locked = d.subscriptions.find((s) => s.id === "adobe")!;
  const a = prepareAction(d, { subscriptionId: locked.id, kind: "cancel" });
  for (const s of d.subscriptions)
    for (const o of s.offers!) o.checkedAt = o.confirmedAt = old;
  const personal = d.subscriptions.find((s) => s.id === "spotify")!;
  personal.source = "Manual";
  const fingerprint = subscriptionFingerprint(locked);
  for (const status of ["awaiting_approval", "running"] as const) {
    a.status = status;
    migrateWorkspace(d);
    assert.equal(subscriptionFingerprint(locked), fingerprint);
    assert.equal(personal.offers![0].checkedAt, old);
    assert.notEqual(
      d.subscriptions.find((s) => s.id === "notion")!.offers![0].checkedAt,
      old,
    );
  }
  a.status = "awaiting_approval";
  a.expiresAt = old;
  migrateWorkspace(d);
  assert.equal(a.status, "expired");
  assert.notEqual(locked.offers![0].checkedAt, old);
});
