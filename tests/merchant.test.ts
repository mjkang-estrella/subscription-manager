import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { createWorkspace } from "../shared/domain.js";
import { prepareAction } from "../server/actions.js";
import {
  createMerchant,
  merchantRouter,
  readMerchant,
  verifyMerchant,
  cleanupWorkspace,
  revokeMerchant,
} from "../server/merchant.js";
import type { ActionKind } from "../shared/types.js";

test("independent hosted handlers: all four flows in both variants, staged writes, exact terms, migration content and capability isolation", async () => {
  const app = express();
  app.use(express.json());
  app.use(merchantRouter);
  app.use((error: any, _req: any, res: any, _next: any) =>
    res.status(error.status || 400).json({ error: error.message }),
  );
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const workspace = crypto.randomUUID();
  try {
    for (const variant of ["standard", "alternate"] as const)
      for (const kind of [
        "cancel",
        "downgrade",
        "yearly",
        "migrate",
      ] as ActionKind[]) {
        const d = createWorkspace(),
          sub = d.subscriptions.find((s) => s.id === "notion")!;
        sub.name = "<script>not executable</script>";
        const a = prepareAction(d, {
          subscriptionId: sub.id,
          kind,
          variant,
          effectiveDate: "2099-01-12",
        });
        const run = await createMerchant(workspace, sub, a);
        const url = `${base}/api/merchant/${run.id}?access=${run.token}`;
        const html = await (await fetch(url)).text();
        assert(html.includes("&lt;script&gt;not executable&lt;/script&gt;"));
        assert(!html.includes("window.accountState"));
        assert.equal(
          (await fetch(url.replace(run.token, "a".repeat(64)))).status,
          403,
        );
        await assert.rejects(
          readMerchant("different-workspace", run.id),
          /not found/,
        );
        const op = async (operation: string, documents?: unknown) => {
          const r = await fetch(
            `${base}/api/merchant/${run.id}/operate?access=${run.token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                operation,
                ...(documents === undefined ? {} : { documents }),
              }),
            },
          );
          return { status: r.status, body: await r.json() };
        };
        assert.equal((await op("confirm")).status, 400);
        assert.equal((await op("manage")).status, 200);
        if (variant === "alternate")
          assert.equal((await op("billing")).status, 200);
        if (kind === "cancel") {
          await op("cancel");
          await op("continue-cancel");
        } else {
          assert.equal((await op(`select:${a.offerId}`)).status, 200);
          if (kind === "migrate") {
            const archive = await op("export");
            assert.equal(archive.body.documents.length, 3);
            const corrupt = structuredClone(archive.body.documents);
            corrupt[0].body = "lost content";
            assert.equal((await op("import", corrupt)).status, 400);
            assert.equal(
              (await op("import", archive.body.documents)).status,
              200,
            );
          }
        }
        const unconfirmed = await readMerchant(workspace, run.id);
        assert.deepEqual(unconfirmed.current, unconfirmed.initial);
        assert.throws(() => verifyMerchant(unconfirmed, a), /not completed/);
        assert.equal((await op("confirm")).status, 200);
        const stored = await readMerchant(workspace, run.id),
          verified = verifyMerchant(stored, a);
        assert.equal(verified.price, a.toPrice);
        assert.equal(verified.effectiveDate, a.effectiveDate);
        assert.equal(verified.scheduled, true);
        assert.deepEqual(stored.current, stored.initial);
        if (kind === "migrate") assert.equal(verified.importedItems, 3);
        const altered = structuredClone(stored);
        altered.selected!.terms.price += 1;
        assert.throws(() => verifyMerchant(altered, a), /terms/);
        const wrongDate = structuredClone(stored);
        wrongDate.scheduled!.effectiveDate = "2099-01-13";
        assert.throws(() => verifyMerchant(wrongDate, a), /schedule/);
        assert.equal((await op("confirm")).status, 400);
        await revokeMerchant(workspace, run.id);
        assert.equal((await fetch(url)).status, 403);
      }
  } finally {
    await cleanupWorkspace(workspace);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
