import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import type { Action, ActionKind, Workspace } from "../shared/types.js";
import { readMerchant, verifyMerchant } from "../server/merchant.js";

// Explicit opt-in: real Kernel browsers against synthetic hosted merchants.
const base =
  process.env.TEST_BASE_URL || "https://folio-subscription-manager.vercel.app";
const jobs = (["standard", "alternate"] as const).flatMap((variant) =>
  (["cancel", "downgrade", "yearly", "migrate"] as ActionKind[]).map(
    (kind) => ({ variant, kind }),
  ),
);
const filter = process.env.MERCHANT_CASE;
const selected = filter
  ? jobs.filter((x) => `${x.variant}:${x.kind}` === filter)
  : jobs;
assert(selected.length, "No matching live merchant cases");
const results: unknown[] = [];
await mkdir("artifacts", { recursive: true });
async function run({ variant, kind }: (typeof jobs)[number]) {
  let cookie = "";
  async function req(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
    expected = 200,
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(40000),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie")!.split(";")[0];
    const data = await r.json();
    assert.equal(
      r.status,
      expected,
      `${variant}:${kind} ${path}: ${JSON.stringify(data)}`,
    );
    return data;
  }
  const workspace: Workspace = await req("/api/workspace");
  let running = false;
  try {
    const sub = workspace.subscriptions.find((s) => s.id === "notion")!;
    const input = {
      subscriptionId: sub.id,
      kind,
      variant,
      ...(kind === "cancel"
        ? {}
        : { offerId: sub.offers!.find((o) => o.kind === kind)!.id }),
    };
    const a: Action = await req("/api/actions/prepare", input);
    await req(`/api/actions/${a.id}/approve`, {}, "POST", 202);
    running = true;
    await req(`/api/actions/${a.id}/approve`, {}, "POST", 409);
    const deadline = Date.now() + 330000;
    let final = a;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      final = await req(`/api/actions/${a.id}`);
      if (final.status !== "running") break;
    }
    running = final.status === "running";
    if (final.status !== "completed" && final.merchantRunId) {
      const state = await readMerchant(
        cookie.split("=")[1],
        final.merchantRunId,
      );
      console.error(
        `${variant}:${kind} stopped at ${state.stage}; exported=${state.exported?.length || 0}; imported=${state.imported?.length || 0}`,
      );
    }
    assert.equal(
      final.status,
      "completed",
      `${variant}:${kind}: ${final.error || final.status}`,
    );
    assert.ok(
      final.artifactAvailable && final.confirmation && final.merchantRunId,
    );
    const id = cookie.split("=")[1];
    // Read the independent Neon merchant row, not an API echo of the proposal.
    const merchant = await readMerchant(id, final.merchantRunId!);
    assert.deepEqual(verifyMerchant(merchant, a), final.verification);
    assert.equal(final.verification!.effectiveDate, a.effectiveDate);
    if (kind === "migrate") {
      assert.deepEqual(merchant.documents, merchant.imported);
      assert.equal(merchant.imported?.length, 3);
    }
    const image = await fetch(`${base}/api/actions/${a.id}/artifact`, {
      headers: { cookie },
    });
    assert.equal(image.status, 200);
    const png = Buffer.from(await image.arrayBuffer());
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    await writeFile(`artifacts/merchant-${variant}-${kind}.png`, png);
    const before: Workspace = await req("/api/workspace");
    assert.deepEqual(
      before.subscriptions.find((s) => s.id === sub.id),
      sub,
      "Test completion never silently changes the ledger",
    );
    const applied: Workspace = await req(`/api/actions/${a.id}/apply`, {});
    assert.equal(applied.outcomes?.length, 1);
    assert.equal(applied.outcomes?.[0].source, "demo");
    const again: Workspace = await req(`/api/actions/${a.id}/apply`, {});
    assert.equal(again.outcomes?.length, 1, "Demo apply is idempotent");
    const changed = applied.subscriptions.find((s) => s.id === sub.id)!;
    if (kind === "cancel")
      assert.equal(
        changed.status,
        a.effectiveDate >= new Date().toISOString().slice(0, 10)
          ? "cancel_pending"
          : "cancelled",
      );
    else if (a.effectiveDate > new Date().toISOString().slice(0, 10))
      assert.equal(changed.scheduledChange?.price, a.toPrice);
    else assert.equal(changed.price, a.toPrice);
    await req("/api/workspace/personal", {});
    await req(`/api/actions/${a.id}/apply`, {}, "POST", 409);
    results.push({
      variant,
      kind,
      status: final.status,
      verification: final.verification,
      confirmation: final.confirmation,
      screenshot: `merchant-${variant}-${kind}.png`,
    });
    await writeFile(
      "artifacts/merchant-live-results.json",
      JSON.stringify(results, null, 2),
    );
    console.log(
      `PASS ${variant}:${kind}: independent state, effective date, receipt, screenshot, explicit idempotent Demo application${kind === "migrate" ? ", exact document transfer" : ""}`,
    );
  } finally {
    if (!running) await req("/api/workspace", { confirm: true }, "DELETE");
  }
}
const concurrency = Math.max(
  1,
  Math.min(2, Number(process.env.MERCHANT_CONCURRENCY || 1)),
);
let cursor = 0;
const failures: unknown[] = [];
await Promise.all(
  Array.from({ length: Math.min(concurrency, selected.length) }, async () => {
    while (cursor < selected.length) {
      const job = selected[cursor++];
      try {
        await run(job);
      } catch (error) {
        failures.push(error);
        console.error(
          error instanceof Error ? error.message : "Live case failed",
        );
      }
    }
  }),
);
await writeFile(
  "artifacts/merchant-live-results.json",
  JSON.stringify(results, null, 2),
);
if (failures.length)
  throw new AggregateError(
    failures,
    `${failures.length} live merchant cases failed`,
  );
console.log(`PASS: ${results.length} live controlled merchant flows`);
