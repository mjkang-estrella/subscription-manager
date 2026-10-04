import type {
  Subscription,
  Recommendation,
  Workspace,
  Evidence,
} from "./types";
export const today = () => new Date().toISOString().slice(0, 10);
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
export const monthly = (s: Pick<Subscription, "price" | "cycle">) =>
  s.price / (s.cycle === "yearly" ? 12 : 1);
export function billingInMonth(s: Subscription, month: string): string | null {
  if (s.status !== "active") return null;
  const [y, m] = month.split("-").map(Number),
    [sy, sm, sd] = s.nextBilling.split("-").map(Number);
  if (y < sy || (y === sy && m < sm)) return null;
  if (s.cycle === "yearly" && m !== sm) return null;
  const day = Math.min(sd, new Date(Date.UTC(y, m, 0)).getUTCDate());
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function utilization(s: Subscription): {
  label: string;
  tone: "green" | "amber" | "gray";
  detail: string;
} {
  const e = s.evidence
    .filter((e) => e.source !== "Receipt")
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  if (!e)
    return {
      label: "Unknown",
      tone: "gray",
      detail: "Connect an activity source or add your usage.",
    };
  if (Date.now() - new Date(e.observedAt).getTime() > 60 * 86400000)
    return {
      label: "Needs refresh",
      tone: "gray",
      detail: "Evidence is older than 60 days.",
    };
  if (e.source === "Browser activity")
    return {
      label: e.usage === 0 ? "No visits observed" : "Browser activity",
      tone: e.usage === 0 ? "amber" : "green",
      detail: e.summary,
    };
  if (e.usage === undefined)
    return { label: "Unknown", tone: "gray", detail: e.summary };
  if (e.usage === 0)
    return { label: "Not used", tone: "amber", detail: e.summary };
  if (e.limit && e.usage / e.limit < 0.15)
    return { label: "Underused", tone: "amber", detail: e.summary };
  return { label: "Actively used", tone: "green", detail: e.summary };
}
export function recommendations(
  subscriptions: Subscription[],
): Recommendation[] {
  return subscriptions
    .filter((s) => s.status === "active")
    .flatMap<Recommendation>((s) => {
      const e = s.evidence
        .filter(
          (e) => e.source !== "Receipt" && e.source !== "Browser activity",
        )
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
      if (!e || Date.now() - new Date(e.observedAt).getTime() > 60 * 86400000)
        return [];
      if (e.usage === 0)
        return [
          {
            id: `${s.id}-cancel`,
            subscriptionId: s.id,
            title: `Reconsider ${s.name}`,
            detail: e.summary,
            savings: monthly(s),
            kind: "cancel" as const,
            confidence:
              e.confidence === "High" ? ("High" as const) : ("Medium" as const),
            caveat:
              "Check shared accounts, mobile usage, and stored data before cancelling.",
          },
        ];
      if (e.usage !== undefined && e.limit && e.usage / e.limit < 0.15)
        return [
          {
            id: `${s.id}-downgrade`,
            subscriptionId: s.id,
            title: `A lighter plan for ${s.name}`,
            detail: e.summary,
            savings: s.source === "Demo" ? Math.max(0, monthly(s) - 9) : 0,
            kind: "downgrade" as const,
            confidence: "Medium" as const,
            caveat:
              s.source === "Demo"
                ? "Illustrative test plan: $9/month. Real prices require merchant verification."
                : "Review available plans to calculate confirmed savings.",
          },
        ];
      return [];
    });
}
export function createWorkspace(): Workspace {
  const now = today(),
    month = now.slice(0, 7),
    day = Number(now.slice(8));
  const ev = (summary: string, usage: number, limit?: number): Evidence => ({
    id: crypto.randomUUID(),
    source: "Account activity",
    summary,
    usage,
    limit,
    days: 30,
    observedAt: now,
    confidence: "High",
  });
  const seeds = [
    [
      "spotify",
      "Spotify",
      "spotify.com",
      "Premium Individual",
      11.99,
      "monthly",
      "Entertainment",
      "#1bca63",
      "S",
      9,
      ev("Listened on 24 of the last 30 days.", 24, 30),
    ],
    [
      "notion",
      "Notion",
      "notion.so",
      "Plus",
      12,
      "monthly",
      "Productivity",
      "#292929",
      "N",
      12,
      ev("Created or edited pages on 21 of the last 30 days.", 21, 30),
    ],
    [
      "adobe",
      "Adobe Creative Cloud",
      "adobe.com",
      "All Apps",
      59.99,
      "monthly",
      "Design",
      "#eb3c32",
      "A",
      16,
      ev("No creative app activity in the last 30 days.", 0, 30),
    ],
    [
      "netflix",
      "Netflix",
      "netflix.com",
      "Standard",
      15.49,
      "monthly",
      "Entertainment",
      "#e50914",
      "N",
      18,
      ev("Watched 12 titles in the last 30 days.", 12, 30),
    ],
    [
      "figma",
      "Figma",
      "figma.com",
      "Professional",
      15,
      "monthly",
      "Design",
      "#9e69ef",
      "F",
      22,
      ev("Edited 2 files; 1 active project in the last 30 days.", 2, 30),
    ],
    [
      "icloud",
      "iCloud+",
      "apple.com",
      "200 GB",
      2.99,
      "monthly",
      "Storage",
      "#3e9cf4",
      "i",
      24,
      ev("146 GB of 200 GB used for photos and backups.", 146, 200),
    ],
    [
      "github",
      "GitHub",
      "github.com",
      "Pro",
      48,
      "yearly",
      "Developer tools",
      "#292929",
      "G",
      27,
      ev("34 contributions and 8 active repositories this month.", 34, 50),
    ],
    [
      "youtube",
      "YouTube Premium",
      "youtube.com",
      "Individual",
      13.99,
      "monthly",
      "Entertainment",
      "#f23b37",
      "▶",
      28,
      ev("No premium activity reported in the last 30 days.", 0, 30),
    ],
  ] as const;
  return {
    mode: "demo",
    createdAt: new Date().toISOString(),
    actions: [],
    subscriptions: seeds.map(
      ([
        id,
        name,
        domain,
        plan,
        price,
        cycle,
        category,
        color,
        icon,
        d,
        evidence,
      ]) => ({
        id,
        name,
        domain,
        plan,
        price,
        cycle,
        category,
        color,
        icon,
        nextBilling: `${month}-${String(Math.max(day, d)).padStart(2, "0")}`,
        currency: "USD",
        status: "active",
        source: "Demo",
        evidence: [evidence],
        notes: "Illustrative demo account. Prices and usage are sample data.",
        createdAt: new Date().toISOString(),
      }),
    ),
  };
}
