import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { load, mutate, removeWorkspace } from "./store.js";
import { exportBackup, importBackup } from "../shared/backup.js";
import {
  rotateToken,
  lookupToken,
  revokeTokens,
  checkRateLimit,
} from "./access.js";
import { closeInspection } from "./inspection.js";
import { deleteWorkspaceSessions } from "./sessions.js";
import { calendarFeed } from "./calendar.js";
const router = Router();
let merchantCleanup: ((workspace: string) => Promise<unknown>) | undefined;
export const setMerchantCleanup = (fn: typeof merchantCleanup) => {
  merchantCleanup = fn;
};
const ensureIdle = async (workspace: string) => {
  const data = await load(workspace);
  if (data.actions.some((a) => a.status === "running"))
    throw new Error(
      "Wait for the running test before replacing or deleting this workspace.",
    );
  return data;
};
function setCookie(res: Response, workspace: string) {
  res.cookie("folio_workspace", workspace, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 365 * 86400000,
    path: "/",
  });
}
function baseUrl(req: Request) {
  return (
    process.env.PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : `${req.protocol}://${req.get("host")}`)
  );
}
router.get("/api/workspace/export", async (_req, res) => {
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="folio-workspace.json"',
  );
  res.json(exportBackup(await load(res.locals.workspace)));
});
router.post("/api/workspace/import", async (req, res) => {
  const b = z
    .object({ backup: z.unknown(), confirmReplace: z.literal(true) })
    .parse(req.body);
  const incoming = importBackup(b.backup);
  await ensureIdle(res.locals.workspace);
  await closeInspection(res.locals.workspace);
  const workspace = await mutate(res.locals.workspace, (d) => {
    if (d.actions.some((a) => a.status === "running"))
      throw new Error("Wait for the running test.");
    for (const key of Object.keys(d))
      delete (d as unknown as Record<string, unknown>)[key];
    Object.assign(d, incoming);
    return d;
  });
  await deleteWorkspaceSessions(res.locals.workspace);
  await merchantCleanup?.(res.locals.workspace);
  await revokeTokens(res.locals.workspace);
  res.json(workspace);
});
router.post("/api/workspace/recovery", async (_req, res) =>
  res.json({ code: await rotateToken(res.locals.workspace, "recovery") }),
);
router.delete("/api/workspace/recovery", async (_req, res) => {
  await revokeTokens(res.locals.workspace, "recovery");
  res.json({ ok: true });
});
router.post("/api/workspace/restore", async (req, res) => {
  const b = z
    .object({
      code: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-f0-9]{64}$/),
      confirmReplace: z.literal(true),
    })
    .parse(req.body);
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
    req.ip ||
    "unknown";
  if (!(await checkRateLimit(`restore:${ip}`, 5, 60000)))
    return res.status(429).json({
      error: "Too many recovery attempts. Wait a minute and try again.",
    });
  const workspace = await lookupToken(b.code, "recovery");
  if (!workspace)
    return res
      .status(401)
      .json({ error: "This recovery code is invalid or has been replaced." });
  setCookie(res, workspace);
  res.json(await load(workspace));
});
router.delete("/api/workspace", async (req, res) => {
  z.object({ confirm: z.literal(true) }).parse(req.body);
  await ensureIdle(res.locals.workspace);
  await removeWorkspace(res.locals.workspace);
  await closeInspection(res.locals.workspace);
  await merchantCleanup?.(res.locals.workspace);
  await deleteWorkspaceSessions(res.locals.workspace);
  await revokeTokens(res.locals.workspace);
  res.clearCookie("folio_workspace", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
  });
  res.json({ ok: true });
});
router.post("/api/workspace/calendar", async (req, res) => {
  const token = await rotateToken(res.locals.workspace, "calendar");
  res.json({ url: `${baseUrl(req)}/api/calendar/${token}.ics` });
});
router.delete("/api/workspace/calendar", async (_req, res) => {
  await revokeTokens(res.locals.workspace, "calendar");
  res.json({ ok: true });
});
router.get("/api/calendar/:token.ics", async (req, res) => {
  const workspace = await lookupToken(String(req.params.token), "calendar");
  if (!workspace)
    return res.status(404).send("Calendar link is invalid or revoked.");
  res.setHeader("Cache-Control", "no-store");
  res
    .type("text/calendar; charset=utf-8")
    .send(calendarFeed(await load(workspace)));
});
export default router;
