import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async request(
      path: string,
      body?: unknown,
      method = body ? "POST" : "GET",
    ) {
      const r = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: base,
          ...(cookie ? { cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie")!.split(";")[0];
      const text = await r.text();
      return {
        status: r.status,
        body: r.headers.get("content-type")?.includes("application/json")
          ? JSON.parse(text)
          : text,
        headers: r.headers,
      };
    },
  };
}
const one = client(),
  two = client();
await one.request("/api/workspace");
await one.request("/api/workspace/personal", {});
const added = await one.request("/api/subscriptions", {
  name: "Ownership test",
  domain: "example.com",
  plan: "Pro",
  price: 24,
  currency: "USD",
  cycle: "monthly",
  nextBilling: "2099-10-10",
  category: "Productivity",
  notes: "Private note",
});
assert.equal(added.status, 201);
const id = added.body.id;
assert.equal(
  (
    await one.request(`/api/subscriptions/${id}/check-in`, {
      wouldRenew: true,
      value: "shared",
    })
  ).status,
  200,
);
const backup = await one.request("/api/workspace/export");
assert.equal(backup.body.version, 2);
assert.equal(backup.body.workspace.subscriptions[0].evidence.length, 1);
await two.request("/api/workspace");
assert.equal(
  (
    await two.request("/api/workspace/import", {
      backup: backup.body,
      confirmReplace: true,
    })
  ).status,
  200,
);
assert.equal(
  (await two.request("/api/workspace")).body.subscriptions[0].id,
  id,
);
const malformed = structuredClone(backup.body);
malformed.workspace.subscriptions[0].price = -5;
assert.equal(
  (
    await two.request("/api/workspace/import", {
      backup: malformed,
      confirmReplace: true,
    })
  ).status,
  400,
);
const code1 = (await one.request("/api/workspace/recovery", {})).body.code;
assert.match(code1, /^[a-f0-9]{64}$/);
const code2 = (await one.request("/api/workspace/recovery", {})).body.code;
assert.notEqual(code1, code2);
assert.equal(
  (
    await two.request("/api/workspace/restore", {
      code: code1,
      confirmReplace: true,
    })
  ).status,
  401,
);
assert.equal(
  (
    await two.request("/api/workspace/restore", {
      code: code2,
      confirmReplace: true,
    })
  ).status,
  200,
);
assert.equal(two.cookie, one.cookie);
const calendar1 = (await one.request("/api/workspace/calendar", {})).body.url;
const feed1 = await fetch(calendar1);
assert.equal(feed1.status, 200);
const ics = await feed1.text();
assert(!ics.includes("Private note"));
assert.equal(feed1.headers.get("cache-control"), "no-store");
const calendar2 = (await one.request("/api/workspace/calendar", {})).body.url;
assert.notEqual(calendar1, calendar2);
assert.equal((await fetch(calendar1)).status, 404);
assert.equal(
  (
    await one.request(`/api/subscriptions/${id}/outcomes`, {
      attested: true,
      kind: "cancel",
      effectiveDate: "2099-10-10",
    })
  ).status,
  200,
);
const state = (await one.request("/api/workspace")).body;
assert.equal(state.subscriptions[0].status, "cancel_pending");
assert.equal(state.outcomes[0].monthlyReduction, 24);
assert.equal((await one.request("/api/workspace", {}, "DELETE")).status, 400);
assert.equal(
  (await one.request("/api/workspace", { confirm: true }, "DELETE")).status,
  200,
);
assert.equal((await fetch(calendar2)).status, 404);
assert.equal(
  (
    await two.request("/api/workspace/restore", {
      code: code2,
      confirmReplace: true,
    })
  ).status,
  401,
);
assert.equal((await one.request("/api/workspace")).body.mode, "demo");
console.log(
  "PASS: personal records, backup round-trip and validation, recovery rotation/restoration, private calendar rotation, recorded cancellation, deletion and revoked access.",
);
