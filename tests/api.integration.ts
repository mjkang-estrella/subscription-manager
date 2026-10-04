import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
let cookie = "";
async function request(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie")!.split(";")[0];
  return { status: r.status, body: await r.json() };
}
const start = await request("/api/workspace");
assert.equal(start.body.subscriptions.length, 8);
const dismissPath = "/api/opportunities/adobe-cancel/dismiss";
const dismissed = await request(dismissPath, { dismissed: true });
assert.equal(dismissed.status, 200);
assert.deepEqual(dismissed.body.dismissedOpportunityIds, ["adobe-cancel"]);
assert.deepEqual(
  (await request("/api/workspace")).body.dismissedOpportunityIds,
  ["adobe-cancel"],
);
assert.deepEqual(dismissed.body.subscriptions, start.body.subscriptions);
assert.deepEqual(
  (await request(dismissPath, { dismissed: true })).body
    .dismissedOpportunityIds,
  ["adobe-cancel"],
);
const isolated = await fetch(base + "/api/workspace");
assert.deepEqual((await isolated.json()).dismissedOpportunityIds ?? [], []);
assert.equal((await request(dismissPath, { dismissed: "yes" })).status, 400);
assert.equal(
  (await request("/api/opportunities/missing/dismiss", { dismissed: true }))
    .status,
  404,
);
assert.deepEqual(
  (await request(dismissPath, { dismissed: false })).body
    .dismissedOpportunityIds,
  [],
);
const input = {
  name: "API Test",
  domain: "example.com",
  plan: "Pro",
  price: 120,
  currency: "USD",
  cycle: "yearly",
  nextBilling: "2026-12-12",
  category: "Productivity",
  notes: "Disposable test",
};
const added = await request("/api/subscriptions", input);
assert.equal(added.status, 201);
const id = added.body.id;
assert.equal((await request("/api/workspace")).body.subscriptions.length, 9);
const other = await fetch(base + "/api/workspace");
assert.equal((await other.json()).subscriptions.length, 8);
assert.equal(
  (await request("/api/subscriptions/" + id, { ...input, price: 60 }, "PATCH"))
    .status,
  200,
);
assert.equal(
  (
    await request(
      "/api/subscriptions/" + id,
      { ...input, nextBilling: "2026-02-31" },
      "PATCH",
    )
  ).status,
  400,
);
const imported = await request("/api/import/parse", {
  type: "csv",
  text: "merchant,amount,date\nSample,10,2026-08-10\nSample,10,2026-09-10",
});
assert.equal(imported.body.candidates.length, 1);
const confirmed = await request("/api/import/confirm", {
  subscriptions: imported.body.candidates,
  source: "CSV",
});
assert.equal(confirmed.body.count, 1);
const duplicate = await request("/api/import/confirm", {
  subscriptions: imported.body.candidates,
  source: "CSV",
});
assert.equal(duplicate.body.count, 0);
await request("/api/subscriptions/" + id, {}, "DELETE");
assert.equal(
  (await request("/api/workspace")).body.subscriptions.some(
    (s: any) => s.id === id,
  ),
  false,
);
const origin = await fetch(base + "/api/chat", {
  method: "POST",
  headers: {
    cookie,
    origin: "https://wrong-origin.example",
    "Content-Type": "application/json",
  },
  body: '{"message":"hi"}',
});
assert.equal(origin.status, 403);
console.log(
  "PASS: opportunity dismissal/restoration/isolation, create/edit/delete, persistence, workspace isolation, input validation, CSV review + deduplication, cross-origin protection.",
);
