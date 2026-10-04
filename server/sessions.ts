import { neon } from "@neondatabase/serverless";
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const local = new Map<string, { value: unknown; expires: number }>();
let ready: Promise<unknown> | undefined;
async function init() {
  if (sql)
    await (ready ??= sql`CREATE TABLE IF NOT EXISTS folio_server_sessions (workspace TEXT NOT NULL, kind TEXT NOT NULL, data JSONB NOT NULL, expires BIGINT NOT NULL, PRIMARY KEY (workspace, kind))`);
  else if (process.env.VERCEL)
    throw new Error("Database storage is required for deployed sessions.");
}
export async function getSession<T>(
  workspace: string,
  kind: string,
): Promise<T | undefined> {
  await init();
  if (sql) {
    await sql`DELETE FROM folio_server_sessions WHERE expires < ${Date.now()}`;
    const rows =
      await sql`SELECT data FROM folio_server_sessions WHERE workspace=${workspace} AND kind=${kind} AND expires > ${Date.now()}`;
    return rows[0]?.data as T | undefined;
  }
  const slot = local.get(`${workspace}:${kind}`);
  if (!slot || slot.expires < Date.now()) {
    local.delete(`${workspace}:${kind}`);
    return undefined;
  }
  return slot.value as T;
}
export async function setSession(
  workspace: string,
  kind: string,
  value: unknown,
  expires: number,
) {
  await init();
  if (sql) {
    await sql`DELETE FROM folio_server_sessions WHERE expires < ${Date.now()}`;
    await sql`INSERT INTO folio_server_sessions (workspace,kind,data,expires) VALUES (${workspace},${kind},${JSON.stringify(value)}::jsonb,${expires}) ON CONFLICT (workspace,kind) DO UPDATE SET data=EXCLUDED.data,expires=EXCLUDED.expires`;
  } else local.set(`${workspace}:${kind}`, { value, expires });
}
export async function deleteSession(workspace: string, kind: string) {
  await init();
  if (sql)
    await sql`DELETE FROM folio_server_sessions WHERE workspace=${workspace} AND kind=${kind}`;
  else local.delete(`${workspace}:${kind}`);
}
