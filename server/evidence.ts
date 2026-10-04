import { Router } from "express";
import { z } from "zod";
import { dateSchema } from "./imports.js";
import { load, mutate } from "./store.js";
import { today, nextRenewal } from "../shared/domain.js";
import { recordOutcome } from "../shared/lifecycle.js";
import {
  startInspection,
  captureDraft,
  readInspection,
  saveInspection,
  closeInspection,
} from "./inspection.js";
const router = Router();
const metric = z.enum(["days", "uses", "quota", "other"]);
const evidenceSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    source: z.literal("Self-reported").default("Self-reported"),
    observedAt: dateSchema
      .refine((v) => v <= today(), "Observation cannot be in the future")
      .default(today),
    metric: metric.optional(),
    unit: z.string().trim().max(40).optional(),
    usage: z.number().finite().min(0).max(1000000).optional(),
    limit: z.number().finite().positive().max(10000000).optional(),
    days: z.number().int().min(1).max(365).optional(),
  })
  .refine(
    (e) =>
      e.metric !== "days" ||
      e.usage === undefined ||
      e.days === undefined ||
      e.usage <= e.days,
    "Active days cannot exceed observation days.",
  );
router.post("/api/subscriptions/:id/evidence", async (req, res) => {
  const evidence = evidenceSchema.parse(req.body);
  await mutate(res.locals.workspace, (d) => {
    const s = d.subscriptions.find((s) => s.id === req.params.id);
    if (!s) throw new Error("Subscription not found.");
    s.evidence.push({
      ...evidence,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      confidence: "Medium",
    });
  });
  res.json({ ok: true });
});
router.delete(
  "/api/subscriptions/:id/evidence/:evidenceId",
  async (req, res) => {
    await mutate(res.locals.workspace, (d) => {
      const s = d.subscriptions.find((s) => s.id === req.params.id);
      if (!s) throw new Error("Subscription not found.");
      s.evidence = s.evidence.filter((e) => e.id !== req.params.evidenceId);
    });
    res.json({ ok: true });
  },
);
router.post("/api/subscriptions/:id/check-in", async (req, res) => {
  const b = z
    .object({
      wouldRenew: z.boolean(),
      value: z.enum(["personal", "shared", "background"]),
      summary: z.string().trim().max(2000).optional(),
    })
    .parse(req.body);
  await mutate(res.locals.workspace, (d) => {
    const s = d.subscriptions.find((s) => s.id === req.params.id);
    if (!s) throw new Error("Subscription not found.");
    s.evidence.push({
      id: crypto.randomUUID(),
      source: "Check-in",
      observedAt: today(),
      createdAt: new Date().toISOString(),
      confidence: "Medium",
      wouldRenew: b.wouldRenew,
      value: b.value,
      summary:
        b.summary ||
        `${b.wouldRenew ? "Would renew" : "Would reconsider renewal"} at the current price. ${b.value === "shared" ? "Shared with others." : b.value === "background" ? "Provides value without regular visits." : "Personal use."}`,
    });
  });
  res.json({ ok: true });
});
router.post("/api/subscriptions/:id/keep", async (req, res) => {
  const renewal = await mutate(res.locals.workspace, (d) => {
    const s = d.subscriptions.find((s) => s.id === req.params.id);
    if (!s) throw new Error("Subscription not found.");
    const date = nextRenewal(s);
    if (!date) throw new Error("No upcoming renewal to keep.");
    (d.keptRenewals ??= {})[s.id] = date;
    return date;
  });
  res.json({ renewal });
});
router.post("/api/subscriptions/:id/outcomes", async (req, res) => {
  const b = z
    .object({
      attested: z.literal(true),
      kind: z.enum(["cancel", "plan"]),
      effectiveDate: dateSchema,
      plan: z.string().trim().min(1).max(100).optional(),
      price: z.number().finite().min(0).max(100000000).optional(),
      cycle: z.enum(["monthly", "yearly"]).optional(),
      nextBilling: dateSchema.optional(),
      note: z.string().max(3000).optional(),
    })
    .refine(
      (b) =>
        b.kind === "cancel" ||
        (b.plan !== undefined &&
          b.price !== undefined &&
          b.cycle !== undefined &&
          b.nextBilling !== undefined),
      "Enter complete plan terms.",
    )
    .refine(
      (b) => b.kind === "cancel" || b.nextBilling! >= b.effectiveDate,
      "Next billing must be on or after the change.",
    )
    .parse(req.body);
  const workspace = await mutate(res.locals.workspace, (d) => {
    recordOutcome(d, String(req.params.id), b);
    return d;
  });
  res.json(workspace);
});
router.post("/api/workspace/visit", async (_req, res) => {
  const r = await mutate(res.locals.workspace, (d) => {
    const previousVisitAt = d.lastVisitedAt;
    d.lastVisitedAt = new Date().toISOString();
    return { previousVisitAt, workspace: d };
  });
  res.json(r);
});
router.post("/api/subscriptions/:id/inspect/start", async (req, res) =>
  res.json(await startInspection(res.locals.workspace, String(req.params.id))),
);
router.get("/api/subscriptions/:id/inspect", async (req, res) =>
  res.json(await readInspection(res.locals.workspace, String(req.params.id))),
);
router.post("/api/subscriptions/:id/inspect/capture", async (req, res) =>
  res.json(await captureDraft(res.locals.workspace, String(req.params.id))),
);
router.post("/api/subscriptions/:id/inspect/save", async (req, res) => {
  const b = z
    .object({
      draftId: z.string().uuid(),
      summary: z.string().trim().min(1).max(2000),
      usage: z.number().finite().min(0).max(1000000).nullable(),
      limit: z.number().finite().positive().max(10000000).nullable(),
      days: z.number().int().min(1).max(365).nullable(),
      metric: metric.optional(),
      unit: z.string().max(40).optional(),
    })
    .parse(req.body);
  await saveInspection(res.locals.workspace, String(req.params.id), b);
  res.json({ ok: true });
});
router.post("/api/inspect/close", async (_req, res) => {
  await closeInspection(res.locals.workspace);
  res.json({ ok: true });
});
export default router;
