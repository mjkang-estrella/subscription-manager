export type Category =
  | "Productivity"
  | "Entertainment"
  | "Design"
  | "Developer tools"
  | "Lifestyle"
  | "Storage";
export type UsageMetric = "days" | "uses" | "quota" | "other";
export type Evidence = {
  id: string;
  source:
    | "Account activity"
    | "Browser activity"
    | "Self-reported"
    | "Receipt"
    | "Check-in";
  summary: string;
  observedAt: string;
  confidence: "High" | "Medium" | "Low";
  metric?: UsageMetric;
  unit?: string;
  createdAt?: string;
  wouldRenew?: boolean;
  value?: "personal" | "shared" | "background";
  days?: number;
  usage?: number;
  limit?: number;
};
export type Subscription = {
  id: string;
  name: string;
  domain: string;
  plan: string;
  price: number;
  currency: "USD";
  cycle: "monthly" | "yearly";
  nextBilling: string;
  category: Category;
  color: string;
  icon: string;
  status: "active" | "cancel_pending" | "cancelled";
  endDate?: string;
  hasDataToMove?: boolean;
  charges?: Charge[];
  research?: Research;
  offers?: PlanOffer[];
  alerts?: string[];
  scheduledChange?: {
    plan: string;
    price: number;
    cycle: "monthly" | "yearly";
    effectiveDate: string;
    nextBilling: string;
  };
  source: "Demo" | "Manual" | "CSV" | "Email";
  evidence: Evidence[];
  notes: string;
  createdAt: string;
};
export type Recommendation = {
  id: string;
  subscriptionId: string;
  title: string;
  detail: string;
  savings: number;
  kind: "cancel" | "downgrade" | "yearly" | "migrate";
  confidence: "High" | "Medium";
  caveat: string;
  evidenceId?: string;
  offerId?: string;
  illustrative?: boolean;
};
export type ActionKind = Recommendation["kind"];
export type Action = {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  kind: ActionKind;
  status:
    | "awaiting_approval"
    | "running"
    | "completed"
    | "failed"
    | "discarded"
    | "expired"
    | "superseded"
    | "historical";
  expiresAt?: string;
  fingerprint?: string;
  offerId?: string;
  appliedAt?: string;
  fixtureVariant?: "standard" | "alternate";
  merchantRunId?: string;
  artifactAvailable?: boolean;
  fromPlan: string;
  toPlan: string;
  fromPrice: number;
  toPrice: number;
  fromCycle: "monthly" | "yearly";
  toCycle: "monthly" | "yearly";
  effectiveDate: string;
  consequence: string;
  steps: { label: string; status: "pending" | "done" | "running" | "failed" }[];
  createdAt: string;
  approvedAt?: string;
  completedAt?: string;
  error?: string;
  confirmation?: string;
  liveViewUrl?: string;
  browserId?: string;
  verification?: {
    plan: string;
    price: number;
    cycle: string;
    status: string;
    effectiveDate?: string;
    scheduled?: boolean;
    exportedItems?: number;
    importedItems?: number;
  };
  mode: "sandbox";
};
export type Workspace = {
  schemaVersion?: number;
  lastVisitedAt?: string;
  keptRenewals?: Record<string, string>;
  outcomes?: RecordedOutcome[];
  dismissedOpportunityIds?: string[];
  subscriptions: Subscription[];
  actions: Action[];
  mode: "demo" | "personal";
  createdAt: string;
};
export type Integration = {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  status: string;
};

export type Charge = {
  id: string;
  date: string;
  amount: number;
  currency: "USD";
  source: "CSV" | "Email" | "Manual";
  description?: string;
};
export type PlanOffer = {
  id: string;
  kind: "downgrade" | "yearly" | "migrate";
  plan: string;
  price: number;
  cycle: "monthly" | "yearly";
  sourceUrl?: string;
  quote?: string;
  checkedAt: string;
  confirmedAt?: string;
  provenance: "research" | "user" | "demo";
  capabilityLoss: string;
  migrationEffort?: string;
};
export type Research = {
  summary: string;
  sources: { title: string; url: string }[];
  checkedAt: string;
  plans?: PlanOffer[];
};
export type Terms = {
  plan: string;
  price: number;
  cycle: "monthly" | "yearly";
  status: Subscription["status"];
  nextBilling: string;
  endDate?: string;
};
export type RecordedOutcome = {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  source: "manual" | "demo";
  kind: "cancel" | "plan";
  before: Terms;
  after: Terms;
  effectiveDate: string;
  recordedAt: string;
  monthlyReduction: number;
  note?: string;
};
export type Verdict = {
  kind:
    "keep" | "needs_evidence" | "cancel" | "downgrade" | "yearly" | "migrate";
  label: string;
  detail: string;
  evidence?: Evidence;
  recommendation?: Recommendation;
  costPerUse?: number;
  unit?: string;
};
