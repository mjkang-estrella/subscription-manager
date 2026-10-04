import { Router } from "express";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import type { Action, ActionKind, Workspace } from "../shared/types.js";
import { monthly, nextRenewal, offerIsFresh, today } from "../shared/domain.js";
import { recordOutcome, subscriptionFingerprint } from "../shared/lifecycle.js";
import { dateSchema } from "./imports.js";
import { load, mutate } from "./store.js";
import { gatewayReady } from "./agent.js";
import { runBrowserAction } from "./browser.js";
import { readMerchant, verifyMerchant } from "./merchant.js";
import { getSession } from "./sessions.js";
const conflict = (message: string) =>
  Object.assign(new Error(message), { status: 409 });
export type PrepareInput = {
  subscriptionId: string;
  kind: ActionKind;
  offerId?: string;
  effectiveDate?: string;
  variant?: "standard" | "alternate";
};
const prepareSchema = z.object({
  subscriptionId: z.string().min(1).max(100),
  kind: z.enum(["cancel", "downgrade", "yearly", "migrate"]),
  offerId: z.string().max(100).optional(),
  effectiveDate: dateSchema.optional(),
  variant: z.enum(["standard", "alternate"]).optional(),
});
export function prepareAction(d: Workspace, input: PrepareInput): Action {
  const s = d.subscriptions.find((s) => s.id === input.subscriptionId);
  if (!s) throw conflict("Subscription not found.");
  if (s.currency !== "USD")
    throw conflict(
      "Controlled merchant tests currently support USD accounts only.",
    );
  if (s.status !== "active" || s.scheduledChange)
    throw conflict(
      "This subscription already has a recorded change or is inactive.",
    );
  if (
    d.actions.some((a) => a.subscriptionId === s.id && a.status === "running")
  )
    throw conflict("A test is already running for this subscription.");
  if (input.kind === "yearly" && s.cycle !== "monthly")
    throw conflict(
      "Annual billing is only available for a monthly subscription.",
    );
  if (input.kind === "migrate" && !s.hasDataToMove)
    throw conflict("Declare data to move before preparing a migration.");
  const offer =
    input.kind === "cancel"
      ? undefined
      : (s.offers || []).find(
          (o) =>
            (input.offerId
              ? o.id === input.offerId
              : s.source === "Demo" && o.provenance === "demo") &&
            o.kind === input.kind &&
            offerIsFresh(o) &&
            (s.source === "Demo" || o.provenance !== "demo"),
        );
  if (input.kind !== "cancel" && !offer)
    throw conflict("Confirm a fresh target offer for this change first.");
  if (
    offer &&
    (monthly(offer) >= monthly(s) ||
      (input.kind === "yearly" && offer.cycle !== "yearly"))
  )
    throw conflict(
      "The target must be cheaper and use the approved billing cycle.",
    );
  const effectiveDate =
    input.effectiveDate ||
    (input.kind === "migrate" ? today() : nextRenewal(s) || today());
  if (effectiveDate < today())
    throw conflict("Choose today or a future effective date.");
  const now = new Date().toISOString();
  const action: Action = {
    id: crypto.randomUUID(),
    subscriptionId: s.id,
    subscriptionName: s.name,
    kind: input.kind,
    status: "awaiting_approval",
    createdAt: now,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    fingerprint: subscriptionFingerprint(s),
    ...(offer ? { offerId: offer.id } : {}),
    fixtureVariant: input.variant || "standard",
    fromPlan: s.plan,
    fromPrice: s.price,
    fromCycle: s.cycle,
    toPlan: offer?.plan || "Cancelled",
    toPrice: offer?.price ?? 0,
    toCycle: offer?.cycle || s.cycle,
    effectiveDate,
    consequence:
      (input.kind === "cancel"
        ? `Test access ends ${effectiveDate}. No refund is assumed.`
        : input.kind === "migrate"
          ? `Export, import and verify three synthetic documents; replacement billing starts ${effectiveDate}.`
          : input.kind === "yearly"
            ? `Annual payment is charged upfront from ${effectiveDate}; an annual commitment applies.`
            : `Lower-plan features and price begin ${effectiveDate}. ${offer!.capabilityLoss}`) +
      (s.source === "Demo"
        ? " Illustrative demo terms."
        : " Controlled test only; your real account is unchanged."),
    mode: "sandbox",
    steps: [
      { label: "Open controlled merchant account", status: "pending" },
      { label: "Navigate the approved change", status: "pending" },
      { label: "Submit through merchant controls", status: "pending" },
      { label: "Verify merchant state and receipt", status: "pending" },
    ],
  };
  d.actions.unshift(action);
  return action;
}
export function claimApproval(d: Workspace, id: string) {
  const a = d.actions.find((a) => a.id === id);
  if (!a) throw conflict("Action not found.");
  if (a.status !== "awaiting_approval")
    throw conflict(
      "This proposal is no longer awaiting approval. Prepare a fresh change.",
    );
  if (!a.expiresAt || Date.parse(a.expiresAt) <= Date.now())
    throw conflict("This proposal expired. Prepare it again.");
  const s = d.subscriptions.find((s) => s.id === a.subscriptionId);
  if (
    !s ||
    a.fingerprint !== subscriptionFingerprint(s) ||
    a.effectiveDate < today()
  )
    throw conflict(
      "Subscription or target terms changed. Prepare a fresh proposal.",
    );
  if (
    a.offerId &&
    !s.offers?.some((o) => o.id === a.offerId && offerIsFresh(o))
  )
    throw conflict(
      "The approved offer is stale. Confirm current terms and prepare again.",
    );
  if (
    d.actions.some(
      (x) =>
        x.id !== id &&
        x.subscriptionId === a.subscriptionId &&
        x.status === "running",
    )
  )
    throw conflict("A test is already running for this subscription.");
  a.status = "running";
  a.approvedAt = new Date().toISOString();
  a.steps[0].status = "running";
  return a;
}
const router = Router();
router.post("/api/actions/prepare", async (req, res) => {
  const input = prepareSchema.parse(req.body);
  res.json(await mutate(res.locals.workspace, (d) => prepareAction(d, input)));
});
router.post("/api/actions/:id/approve", async (req, res) => {
  if (!gatewayReady() || !process.env.KERNEL_API_KEY)
    throw conflict(
      "Connect Neon AI Gateway and Kernel before running a controlled test.",
    );
  const workspace = res.locals.workspace as string,
    id = String(req.params.id);
  await mutate(workspace, (d) => claimApproval(d, id));
  const origin =
    process.env.PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : `${req.protocol}://${req.get("host")}`);
  const work = runBrowserAction(workspace, id, origin);
  if (process.env.VERCEL) waitUntil(work);
  else void work;
  res.status(202).json({ ok: true });
});
router.post("/api/actions/:id/discard", async (req, res) => {
  res.json(
    await mutate(res.locals.workspace, (d) => {
      const a = d.actions.find((x) => x.id === req.params.id);
      if (!a || a.status !== "awaiting_approval")
        throw conflict("Only an unapproved proposal can be discarded.");
      a.status = "discarded";
      return a;
    }),
  );
});
router.post("/api/actions/:id/reprepare", async (req, res) => {
  res.json(
    await mutate(res.locals.workspace, (d) => {
      const old = d.actions.find((x) => x.id === req.params.id);
      if (
        !old ||
        !["failed", "expired", "discarded", "superseded"].includes(old.status)
      )
        throw conflict(
          "Only a stopped or expired proposal can be prepared again.",
        );
      const input = prepareSchema.parse({
        subscriptionId: old.subscriptionId,
        kind: old.kind,
        offerId: old.offerId,
        variant: old.fixtureVariant,
        ...req.body,
      });
      return prepareAction(d, input);
    }),
  );
});
router.get("/api/actions/:id", async (req, res) => {
  const a = (await load(res.locals.workspace)).actions.find(
    (a) => a.id === req.params.id,
  );
  if (!a) return res.status(404).json({ error: "Action not found." });
  res.json(a);
});
router.post("/api/actions/:id/apply", async (req, res) => {
  const workspace = res.locals.workspace as string,
    id = String(req.params.id);
  const a = (await load(workspace)).actions.find((a) => a.id === id);
  if (!a || a.status !== "completed" || !a.merchantRunId)
    throw conflict(
      "Only an independently verified completed test can be applied.",
    );
  verifyMerchant(await readMerchant(workspace, a.merchantRunId), a);
  res.json(
    await mutate(workspace, (d) => {
      const current = d.actions.find((a) => a.id === id)!;
      const sub = d.subscriptions.find((s) => s.id === current.subscriptionId);
      if (d.mode !== "demo" || sub?.source !== "Demo")
        throw conflict(
          "Controlled results can only be applied to a Demo subscription.",
        );
      if (current.appliedAt) return d;
      if (subscriptionFingerprint(sub) !== current.fingerprint)
        throw conflict(
          "The tracked subscription changed. This old test cannot be applied.",
        );
      recordOutcome(
        d,
        sub.id,
        {
          kind: current.kind === "cancel" ? "cancel" : "plan",
          effectiveDate: current.effectiveDate,
          plan: current.toPlan,
          price: current.toPrice,
          cycle: current.toCycle,
          nextBilling: current.effectiveDate,
          note: "Explicitly applied from verified controlled merchant test.",
        },
        "demo",
      );
      current.appliedAt = new Date().toISOString();
      return d;
    }),
  );
});
router.get("/api/actions/:id/artifact", async (req, res) => {
  const workspace = res.locals.workspace as string,
    id = String(req.params.id);
  const a = (await load(workspace)).actions.find((a) => a.id === id);
  if (!a?.artifactAvailable)
    return res.status(404).json({ error: "Screenshot not found." });
  const artifact = await getSession<{ png: string }>(
    workspace,
    `artifact:${id}`,
  );
  if (!artifact)
    return res
      .status(404)
      .json({ error: "This verification screenshot has expired." });
  res.setHeader("Cache-Control", "no-store");
  res.type("image/png").send(Buffer.from(artifact.png, "base64"));
});
export default router;
