import { Router } from "express";
import { z } from "zod";
import {
  candidateSchema,
  confirmImports,
  IMPORT_LIMITS,
  inspectImport,
  parseDiscovery,
} from "./imports.js";
import {
  confirmOffer,
  parseConfirmation,
  researchSubscription,
  saveResearch,
} from "./research.js";
import { load, mutate } from "./store.js";

const router = Router();
const mappingSchema = z.object(
  Object.fromEntries(
    [
      "merchant",
      "amount",
      "date",
      "currency",
      "debit",
      "credit",
      "cycle",
      "domain",
      "category",
      "plan",
    ].map((key) => [key, z.string().max(200).optional()]),
  ),
);
router.post("/api/import/inspect", (req, res) => {
  const { text } = z
    .object({ text: z.string().min(1).max(IMPORT_LIMITS.bytes) })
    .parse(req.body);
  res.json(inspectImport(text));
});
router.post("/api/import/parse", async (req, res) => {
  const body = z
    .object({
      type: z.enum(["csv", "email"]),
      text: z.string().max(IMPORT_LIMITS.bytes).optional(),
      files: z
        .array(
          z.object({
            name: z.string().min(1).max(200),
            text: z.string().max(IMPORT_LIMITS.fileBytes),
          }),
        )
        .max(IMPORT_LIMITS.files)
        .optional(),
      mapping: mappingSchema.optional(),
      dateOrder: z.enum(["MDY", "DMY", "YMD"]).optional(),
      chargeSign: z.enum(["positive", "negative"]).optional(),
    })
    .parse(req.body);
  const workspace = await load(res.locals.workspace);
  res.json(await parseDiscovery(body, workspace.subscriptions));
});
router.post("/api/import/confirm", async (req, res) => {
  const body = z
    .object({
      subscriptions: z
        .array(candidateSchema)
        .min(1)
        .max(IMPORT_LIMITS.candidates),
      source: z.enum(["CSV", "Email"]),
      matches: z.record(z.string().max(100), z.string().max(100)).optional(),
    })
    .parse(req.body);
  res.json(
    await mutate(res.locals.workspace, (d) =>
      confirmImports(d, body.subscriptions, body.source, body.matches),
    ),
  );
});
router.post("/api/subscriptions/:id/research", async (req, res) => {
  const workspace = await load(res.locals.workspace),
    sub = workspace.subscriptions.find((s) => s.id === req.params.id);
  if (!sub) {
    res.status(404).json({ error: "Subscription not found." });
    return;
  }
  // All external calls and validation finish before entering retryable mutations.
  const research = await researchSubscription(sub);
  await mutate(res.locals.workspace, (data) => {
    const current = data.subscriptions.find((s) => s.id === sub.id);
    if (
      !current ||
      ["name", "plan", "price", "cycle"].some(
        (k) =>
          current[k as keyof typeof current] !== sub[k as keyof typeof sub],
      )
    )
      throw new Error(
        "Subscription changed during research. Research again. Nothing saved.",
      );
    saveResearch(current, research);
  });
  res.json(research);
});
router.post("/api/subscriptions/:id/offers", async (req, res) => {
  const offer = await mutate(res.locals.workspace, (data) => {
    const sub = data.subscriptions.find((s) => s.id === req.params.id);
    if (!sub) throw new Error("Subscription not found.");
    return confirmOffer(sub, req.body);
  });
  res.json(offer);
});
router.post("/api/confirmation/parse", async (req, res) => {
  const { text } = z
    .object({ text: z.string().min(1).max(20000) })
    .parse(req.body);
  res.json(await parseConfirmation(text));
});
export default router;
