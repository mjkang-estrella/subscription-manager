import assert from "node:assert/strict";
import type { Workspace, Research } from "../shared/types.js";

// Explicit opt-in: calls the configured Gateway and Exa with synthetic input.
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
let cookie = "";
async function request<T = any>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(170000),
  });
  if (response.headers.get("set-cookie"))
    cookie = response.headers.get("set-cookie")!.split(";")[0];
  const value = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(value)}`);
  return value;
}
await request("/api/workspace");
try {
  await request("/api/workspace/personal", {});
  const sub = await request("/api/subscriptions", {
    name: "Notion",
    domain: "notion.so",
    plan: "Plus",
    price: 12,
    cycle: "monthly",
    currency: "USD",
    nextBilling: "2099-11-04",
    category: "Productivity",
    notes: "Disposable live verification record",
  });
  const receipt = await request("/api/import/parse", {
    type: "email",
    text: "Subject: Example Pro receipt\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nExample Pro subscription receipt. Pro plan: $10 USD monthly. Paid October 4, 2026. Next billing November 4, 2026.",
  });
  assert.equal(receipt.candidates[0].price, 10);
  console.log("PASS: live Gateway receipt extraction with source validation");
  const confirmation = await request("/api/confirmation/parse", {
    text: "Your subscription is cancelled. Access ends November 4, 2026.",
  });
  assert.equal(confirmation.endDate, "2026-11-04");
  console.log("PASS: grounded confirmation date suggestion");
  const research = await request<Research>(
    `/api/subscriptions/${sub.id}/research`,
    {},
  );
  assert.ok(research.summary && research.sources.length);
  const saved = await request<Workspace>("/api/workspace");
  assert.equal(saved.subscriptions[0].research!.checkedAt, research.checkedAt);
  for (const offer of research.plans || []) {
    assert.equal(offer.provenance, "research");
    assert.equal(offer.confirmedAt, undefined);
    assert.ok(offer.quote && offer.sourceUrl);
  }
  console.log(
    `PASS: Exa + Gateway research persisted; ${research.plans?.length ?? 0} quoted plans returned`,
  );
  const chat = await request("/api/chat", {
    messages: [
      { role: "user", content: "I am asking about my Notion subscription." },
      { role: "assistant", content: "You have a Notion Plus subscription." },
      {
        role: "user",
        content:
          "What is its current saved price? Give one sentence mentioning the service.",
      },
    ],
  });
  assert.match(chat.text, /12/);
  assert.equal(chat.links[0].subscriptionId, sub.id);
  console.log("PASS: contextual assistant follow-up and safe internal link");
} finally {
  await request("/api/workspace", { confirm: true }, "DELETE");
}
