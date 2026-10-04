export type Category =
  | "Productivity"
  | "Entertainment"
  | "Design"
  | "Developer tools"
  | "Lifestyle"
  | "Storage";
export type Evidence = {
  id: string;
  source: "Account activity" | "Browser activity" | "Self-reported" | "Receipt";
  summary: string;
  observedAt: string;
  confidence: "High" | "Medium" | "Low";
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
  status: "active" | "cancelled";
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
};
export type ActionKind = Recommendation["kind"];
export type Action = {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  kind: ActionKind;
  status: "awaiting_approval" | "running" | "completed" | "failed";
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
    exportedItems?: number;
    importedItems?: number;
  };
  mode: "sandbox";
};
export type Workspace = {
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
