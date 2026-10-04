import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { PublicHistory } from "../shared/publication.js";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const file = ".data/public-history.json";
async function init() {
  if (sql)
    await sql`CREATE TABLE IF NOT EXISTS folio_public_snapshots (slug TEXT PRIMARY KEY, data JSONB NOT NULL)`;
}
export async function readPublicHistory(): Promise<PublicHistory | null> {
  await init();
  if (sql) {
    const rows =
      await sql`SELECT data FROM folio_public_snapshots WHERE slug='default'`;
    return (rows[0]?.data as PublicHistory) ?? null;
  }
  if (process.env.VERCEL) throw new Error("Database storage is required.");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
// Operator-only publication: deliberately no public HTTP write endpoint.
export async function publishHistory(data: PublicHistory) {
  await init();
  if (sql)
    await sql`INSERT INTO folio_public_snapshots(slug,data) VALUES ('default',${JSON.stringify(data)}::jsonb) ON CONFLICT(slug) DO UPDATE SET data=EXCLUDED.data`;
  else {
    if (process.env.VERCEL) throw new Error("Database storage is required.");
    await mkdir(".data", { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify(data), { mode: 0o600 });
  }
}
