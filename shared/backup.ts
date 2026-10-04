import { z } from "zod";
import type { Workspace } from "./types.js";
const text = (max = 3000) => z.string().max(max);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
const timestamp = z.string().datetime();
const amount = z.number().finite().min(0).max(100000000);
const cycle = z.enum(["monthly", "yearly"]);
const status = z.enum(["active", "cancel_pending", "cancelled", "unconfirmed"]);
const httpUrl = z
  .string()
  .max(2000)
  .refine((v) => {
    try {
      return ["https:", "http:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "Expected a website URL");
const evidence = z.object({
  id: text(100),
  source: z.enum([
    "Account activity",
    "Browser activity",
    "Self-reported",
    "Receipt",
    "Check-in",
  ]),
  summary: text(4000),
  sourceUrl: httpUrl.optional(),
  observedAt: date,
  confidence: z.enum(["High", "Medium", "Low"]),
  metric: z.enum(["days", "uses", "quota", "other"]).optional(),
  unit: text(40).optional(),
  createdAt: timestamp.optional(),
  wouldRenew: z.boolean().optional(),
  value: z.enum(["personal", "shared", "background"]).optional(),
  days: z.number().int().min(1).max(365).optional(),
  usage: z.number().finite().min(0).max(1000000).optional(),
  limit: z.number().finite().positive().max(10000000).optional(),
});
const offer = z.object({
  id: text(100),
  kind: z.enum(["downgrade", "yearly", "migrate"]),
  plan: text(100),
  price: amount,
  cycle,
  sourceUrl: httpUrl.optional(),
  quote: text(5000).optional(),
  checkedAt: timestamp,
  confirmedAt: timestamp.optional(),
  provenance: z.enum(["research", "user", "demo"]),
  capabilityLoss: text(),
  migrationEffort: text().optional(),
});
const terms = z.object({
  plan: text(100),
  price: amount,
  cycle,
  status,
  nextBilling: date,
  endDate: date.optional(),
});
const subscription = terms
  .extend({
    id: text(100).min(1),
    name: text(100).min(1),
    domain: text(160),
    currency: z.enum(["USD", "KRW", "EUR", "GBP", "JPY", "CAD", "AUD", "TRY"]),
    category: z.enum([
      "Productivity",
      "Entertainment",
      "Design",
      "Developer tools",
      "Lifestyle",
      "Storage",
    ]),
    color: text(30),
    icon: text(20),
    source: z.enum(["Demo", "Manual", "CSV", "Email"]),
    evidence: z.array(evidence).max(1000),
    notes: text(),
    createdAt: timestamp,
    priceKnown: z.boolean().optional(),
    billingNote: text(200).optional(),
    hasDataToMove: z.boolean().optional(),
    charges: z
      .array(
        z.object({
          id: text(100),
          date,
          amount,
          currency: z.enum([
            "USD",
            "KRW",
            "EUR",
            "GBP",
            "JPY",
            "CAD",
            "AUD",
            "TRY",
          ]),
          source: z.enum(["CSV", "Email", "Manual"]),
          description: text(1000).optional(),
          sourceUrl: httpUrl.optional(),
        }),
      )
      .max(10000)
      .optional(),
    research: z
      .object({
        summary: text(15000),
        sources: z.array(z.object({ title: text(500), url: httpUrl })).max(30),
        checkedAt: timestamp,
        plans: z.array(offer).max(30).optional(),
      })
      .optional(),
    offers: z.array(offer).max(100).optional(),
    alerts: z.array(text()).max(100).optional(),
    scheduledChange: z
      .object({
        plan: text(100),
        price: amount,
        cycle,
        effectiveDate: date,
        nextBilling: date,
      })
      .optional(),
  })
  .refine(
    (s) => s.status !== "cancel_pending" || Boolean(s.endDate),
    "Pending cancellation needs an end date",
  );
const outcome = z.object({
  id: text(100),
  subscriptionId: text(100),
  subscriptionName: text(100),
  source: z.enum(["manual", "demo"]),
  kind: z.enum(["cancel", "plan"]),
  before: terms,
  after: terms,
  effectiveDate: date,
  recordedAt: timestamp,
  monthlyReduction: z.number().finite().min(-100000000).max(100000000),
  note: text().optional(),
});
const action = z.object({
  id: text(100),
  subscriptionId: text(100),
  subscriptionName: text(100),
  kind: z.enum(["cancel", "downgrade", "yearly", "migrate"]),
  status: z.enum([
    "awaiting_approval",
    "running",
    "completed",
    "failed",
    "discarded",
    "expired",
    "superseded",
    "historical",
  ]),
  fromPlan: text(100),
  toPlan: text(100),
  fromPrice: amount,
  toPrice: amount,
  fromCycle: cycle,
  toCycle: cycle,
  effectiveDate: date,
  consequence: text(),
  steps: z
    .array(
      z.object({
        label: text(200),
        status: z.enum(["pending", "done", "running", "failed"]),
      }),
    )
    .max(30),
  createdAt: timestamp,
  approvedAt: timestamp.optional(),
  completedAt: timestamp.optional(),
  error: text().optional(),
  confirmation: text(500).optional(),
  appliedAt: timestamp.optional(),
  verification: z
    .object({
      plan: text(100),
      price: amount,
      cycle: text(20),
      status: text(30),
      effectiveDate: date.optional(),
      scheduled: z.boolean().optional(),
      exportedItems: z.number().int().nonnegative().optional(),
      importedItems: z.number().int().nonnegative().optional(),
    })
    .optional(),
  mode: z.literal("sandbox"),
});
export const backupSchema = z
  .object({
    format: z.literal("folio"),
    version: z.literal(2),
    workspace: z.object({
      schemaVersion: z.literal(2).optional(),
      subscriptions: z.array(subscription).max(1000),
      actions: z.array(action).max(1000),
      mode: z.enum(["demo", "personal"]),
      createdAt: timestamp,
      lastVisitedAt: timestamp.optional(),
      dismissedOpportunityIds: z.array(text(200)).max(5000).optional(),
      keptRenewals: z.record(z.string().max(100), date).optional(),
      outcomes: z.array(outcome).max(5000).optional(),
    }),
  })
  .superRefine((b, ctx) => {
    const ids = b.workspace.subscriptions.map((s) => s.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Subscription IDs must be unique",
      });
    if (
      b.workspace.mode === "personal" &&
      b.workspace.subscriptions.some((s) => s.source === "Demo")
    )
      ctx.addIssue({
        code: "custom",
        message: "Personal backups cannot include demo subscriptions",
      });
  });
export function exportBackup(workspace: Workspace) {
  const copy = structuredClone(workspace);
  copy.schemaVersion = 2;
  const safe = backupSchema.parse({
    format: "folio",
    version: 2,
    workspace: copy,
  });
  // Running tasks cannot be resumed or forged through a data file.
  for (const a of safe.workspace.actions) {
    a.status = "historical";
    a.steps = a.steps.map((s) => ({
      ...s,
      status: s.status === "running" ? "failed" : s.status,
    }));
  }
  return safe;
}
export function importBackup(value: unknown): Workspace {
  const safe = backupSchema.parse(value);
  const data = safe.workspace as Workspace;
  for (const a of data.actions) {
    a.status = "historical";
    a.steps = a.steps.map((s) => ({
      ...s,
      status: s.status === "running" ? "failed" : s.status,
    }));
  }
  return data;
}
