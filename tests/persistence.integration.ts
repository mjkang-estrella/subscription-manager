import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for persistence checks.");
const sql = neon(process.env.DATABASE_URL);
// Independent module instances model two Vercel processes with separate locks.
const first = await import(
  new URL("../server/store.ts?instance=first", import.meta.url).href
);
const second = await import(
  new URL("../server/store.ts?instance=second", import.meta.url).href
);
const sessionsA = await import(
  new URL("../server/sessions.ts?instance=first", import.meta.url).href
);
const sessionsB = await import(
  new URL("../server/sessions.ts?instance=second", import.meta.url).href
);
const accessA = await import(
  new URL("../server/access.ts?instance=first", import.meta.url).href
);
const accessB = await import(
  new URL("../server/access.ts?instance=second", import.meta.url).href
);
const id = randomBytes(24).toString("hex");
try {
  const [a, b] = await Promise.all([first.load(id), second.load(id)]);
  assert.deepEqual(
    a,
    b,
    "Concurrent initialization returns the same workspace",
  );
  let arrived = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = (store: typeof first, value: string) => {
    let attempt = 0;
    return store.mutate(
      id,
      async (data: { dismissedOpportunityIds?: string[] }) => {
        if (attempt++ === 0) {
          if (++arrived === 2) release();
          await barrier;
        }
        data.dismissedOpportunityIds = [
          ...(data.dismissedOpportunityIds ?? []),
          value,
        ];
      },
    );
  };
  await Promise.all([write(first, "one"), write(second, "two")]);
  assert.deepEqual((await first.load(id)).dismissedOpportunityIds.sort(), [
    "one",
    "two",
  ]);
  await sessionsA.setSession(
    id,
    "inspection",
    { id: "test-browser" },
    Date.now() + 60000,
  );
  assert.deepEqual(await sessionsB.getSession(id, "inspection"), {
    id: "test-browser",
  });
  assert.equal(await sessionsB.getSession(id, "gmail"), undefined);
  assert.equal(
    await sessionsB.getSession(id + "other", "inspection"),
    undefined,
  );
  await sessionsB.deleteSession(id, "inspection");
  assert.equal(await sessionsA.getSession(id, "inspection"), undefined);
  await sessionsA.setSession(id, "gmail", { state: "expired" }, Date.now() - 1);
  assert.equal(await sessionsB.getSession(id, "gmail"), undefined);
  const code = await accessA.rotateToken(id, "recovery");
  assert.equal(await accessB.lookupToken(code, "recovery"), id);
  const saved =
    await sql`SELECT token_hash FROM folio_access_tokens WHERE workspace=${id}`;
  assert.notEqual(saved[0].token_hash, code);
  const nextCode = await accessB.rotateToken(id, "recovery");
  assert.equal(await accessA.lookupToken(code, "recovery"), undefined);
  assert.equal(await accessA.lookupToken(nextCode, "calendar"), undefined);
  const rates = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      (i % 2 ? accessA : accessB).checkRateLimit(id, 3),
    ),
  );
  assert.equal(rates.filter(Boolean).length, 3);
  await accessA.revokeTokens(id);
  assert.equal(await accessB.lookupToken(nextCode, "recovery"), undefined);
  console.log(
    "PASS: concurrency, shared sessions, expiry, hashed capability rotation/isolation, and distributed rate limit.",
  );
} finally {
  await sql`DELETE FROM folio_access_tokens WHERE workspace=${id}`;
  await sql`DELETE FROM folio_rate_limits WHERE id=${accessA.tokenHash(id)}`;
  await sql`DELETE FROM folio_workspaces WHERE id=${id}`;
  await sql`DELETE FROM folio_server_sessions WHERE workspace=${id}`;
}
