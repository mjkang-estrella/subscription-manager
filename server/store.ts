import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createWorkspace } from "../shared/domain.js";
import type { Workspace } from "../shared/types.js";
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let ready: Promise<unknown> | undefined;
const locks = new Map<string, Promise<unknown>>();
export const storageMode = sql ? "Neon Postgres" : "Local file";
async function init() {
  if (sql)
    await (ready ??= sql`CREATE TABLE IF NOT EXISTS folio_workspaces (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  else if (process.env.VERCEL)
    throw new Error("Database storage is required on Vercel.");
  else await mkdir(".data", { recursive: true, mode: 0o700 });
}
async function readWorkspace(id: string): Promise<Workspace> {
  await init();
  if (sql) {
    let rows = await sql`SELECT data FROM folio_workspaces WHERE id=${id}`;
    if (!rows.length) {
      await sql`INSERT INTO folio_workspaces (id,data) VALUES (${id},${JSON.stringify(createWorkspace())}::jsonb) ON CONFLICT(id) DO NOTHING`;
      rows = await sql`SELECT data FROM folio_workspaces WHERE id=${id}`;
    }
    return rows[0].data as Workspace;
  }
  try {
    return JSON.parse(await readFile(`.data/${id}.json`, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const data = createWorkspace();
    await saveLocal(id, data);
    return data;
  }
}
async function saveLocal(id: string, data: Workspace) {
  await writeFile(`.data/${id}.tmp`, JSON.stringify(data), { mode: 0o600 });
  await rename(`.data/${id}.tmp`, `.data/${id}.json`);
}
async function compareAndSave(id: string, before: string, data: Workspace) {
  if (!sql) {
    await saveLocal(id, data);
    return true;
  }
  const rows =
    await sql`UPDATE folio_workspaces SET data=${JSON.stringify(data)}::jsonb,updated_at=NOW() WHERE id=${id} AND data=${before}::jsonb RETURNING id`;
  return rows.length > 0;
}
export async function load(id: string): Promise<Workspace> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const data = await readWorkspace(id);
    const before = JSON.stringify(data);
    if (!recover(data) || (await compareAndSave(id, before, data))) return data;
  }
  throw new Error("Workspace is busy. Please try again.");
}
export async function mutate<T>(
  id: string,
  fn: (data: Workspace) => T | Promise<T>,
): Promise<T> {
  const prior = locks.get(id) ?? Promise.resolve();
  const task = prior
    .catch(() => {})
    .then(async () => {
      // Callbacks may be retried after a concurrent serverless request writes.
      // Keep external effects outside this callback.
      for (let attempt = 0; attempt < 16; attempt++) {
        const data = await load(id);
        const before = JSON.stringify(data);
        const result = await fn(data);
        if (await compareAndSave(id, before, data)) return result;
      }
      throw new Error("Workspace is busy. Please try again.");
    });
  locks.set(id, task);
  try {
    return await task;
  } finally {
    if (locks.get(id) === task) locks.delete(id);
  }
}

function recover(data: Workspace): boolean {
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
  return changed;
}
