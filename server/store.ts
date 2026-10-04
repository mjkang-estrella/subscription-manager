import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createWorkspace } from "../shared/domain";
import type { Workspace } from "../shared/types";
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let ready: Promise<unknown> | undefined;
const locks = new Map<string, Promise<unknown>>();
export const storageMode = sql ? "Neon Postgres" : "Local file";
async function init() {
  if (sql)
    await (ready ??= sql`CREATE TABLE IF NOT EXISTS folio_workspaces (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  else await mkdir(".data", { recursive: true, mode: 0o700 });
}
export async function load(id: string): Promise<Workspace> {
  await init();
  if (sql) {
    const rows = await sql`SELECT data FROM folio_workspaces WHERE id=${id}`;
    if (rows.length) return recover(id, rows[0].data as Workspace);
  } else {
    try {
      return recover(
        id,
        JSON.parse(await readFile(`.data/${id}.json`, "utf8")),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  const data = createWorkspace();
  await save(id, data);
  return data;
}
export async function save(id: string, data: Workspace) {
  await init();
  if (sql)
    await sql`INSERT INTO folio_workspaces (id,data) VALUES (${id},${JSON.stringify(data)}::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`;
  else {
    await writeFile(`.data/${id}.tmp`, JSON.stringify(data), { mode: 0o600 });
    await rename(`.data/${id}.tmp`, `.data/${id}.json`);
  }
}
export async function mutate<T>(
  id: string,
  fn: (data: Workspace) => T | Promise<T>,
): Promise<T> {
  const prior = locks.get(id) ?? Promise.resolve();
  const task = prior
    .catch(() => {})
    .then(async () => {
      const data = await load(id);
      const result = await fn(data);
      await save(id, data);
      return result;
    });
  locks.set(id, task);
  try {
    return await task;
  } finally {
    if (locks.get(id) === task) locks.delete(id);
  }
}

async function recover(id: string, data: Workspace): Promise<Workspace> {
  let changed = false;
  for (const action of data.actions) {
    if (
      action.status === "running" &&
      Date.now() - Date.parse(action.approvedAt || action.createdAt) >
        15 * 60 * 1000
    ) {
      action.status = "failed";
      action.error =
        "This browser run was interrupted or expired. Review the result before preparing another change.";
      delete action.liveViewUrl;
      action.steps.forEach((step) => {
        if (step.status === "running") step.status = "failed";
      });
      changed = true;
    }
  }
  if (changed) await save(id, data);
  return data;
}
