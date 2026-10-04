import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let ready: Promise<unknown> | undefined;
const localTokens = new Map<
  string,
  { hash: string; workspace: string; kind: string }
>();
const localLimits = new Map<string, { count: number; reset: number }>();
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
async function init() {
  if (sql)
    await (ready ??= Promise.all([
      sql`CREATE TABLE IF NOT EXISTS folio_access_tokens (workspace TEXT NOT NULL, kind TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, PRIMARY KEY(workspace,kind))`,
      sql`CREATE TABLE IF NOT EXISTS folio_rate_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, reset BIGINT NOT NULL)`,
    ]));
  else if (process.env.VERCEL)
    throw new Error("Database access storage is required.");
}
export async function rotateToken(
  workspace: string,
  kind: "recovery" | "calendar",
) {
  await init();
  const token = randomBytes(32).toString("hex"),
    hash = tokenHash(token);
  if (sql)
    await sql`INSERT INTO folio_access_tokens (workspace,kind,token_hash) VALUES (${workspace},${kind},${hash}) ON CONFLICT(workspace,kind) DO UPDATE SET token_hash=EXCLUDED.token_hash`;
  else localTokens.set(`${workspace}:${kind}`, { hash, workspace, kind });
  return token;
}
export async function lookupToken(
  token: string,
  kind: "recovery" | "calendar",
) {
  if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
  await init();
  const hash = tokenHash(token);
  if (sql) {
    const rows =
      await sql`SELECT workspace FROM folio_access_tokens WHERE token_hash=${hash} AND kind=${kind}`;
    return rows[0]?.workspace as string | undefined;
  }
  return [...localTokens.values()].find(
    (x) => x.hash === hash && x.kind === kind,
  )?.workspace;
}
export async function revokeTokens(
  workspace: string,
  kind?: "recovery" | "calendar",
) {
  await init();
  if (sql) {
    if (kind)
      await sql`DELETE FROM folio_access_tokens WHERE workspace=${workspace} AND kind=${kind}`;
    else
      await sql`DELETE FROM folio_access_tokens WHERE workspace=${workspace}`;
  } else
    for (const [key, value] of localTokens)
      if (value.workspace === workspace && (!kind || kind === value.kind))
        localTokens.delete(key);
}
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60000,
): Promise<boolean> {
  await init();
  const id = tokenHash(key),
    now = Date.now(),
    reset = now + windowMs;
  if (sql) {
    await sql`DELETE FROM folio_rate_limits WHERE reset < ${now}`;
    const rows =
      await sql`INSERT INTO folio_rate_limits (id,count,reset) VALUES (${id},1,${reset}) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN folio_rate_limits.reset<=${now} THEN 1 ELSE folio_rate_limits.count+1 END,reset=CASE WHEN folio_rate_limits.reset<=${now} THEN ${reset} ELSE folio_rate_limits.reset END RETURNING count`;
    return Number(rows[0].count) <= limit;
  }
  let slot = localLimits.get(id);
  if (!slot || slot.reset <= now) {
    slot = { count: 0, reset };
    localLimits.set(id, slot);
  }
  slot.count++;
  return slot.count <= limit;
}
