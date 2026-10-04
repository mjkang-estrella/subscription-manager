import type { ActionKind, Category, Subscription } from "../shared/types";

export const CATEGORIES: Category[] = [
  "Productivity",
  "Entertainment",
  "Design",
  "Developer tools",
  "Lifestyle",
  "Storage",
];

export const actionNames: Record<ActionKind, string> = {
  cancel: "Cancel subscription",
  downgrade: "Downgrade plan",
  yearly: "Switch to annual",
  migrate: "Migrate to an alternative",
};

export const monthName = (date: Date, short = false) =>
  date.toLocaleDateString("en-US", {
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
    timeZone: "UTC",
  });

// Dates are calendar days (YYYY-MM-DD); format at UTC noon so no local
// timezone can shift them onto the previous or next day.
export const dateLabel = (s: string, withYear = false) =>
  new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });

export const per = (cycle: Subscription["cycle"]) =>
  cycle === "yearly" ? "year" : "month";

export const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86400000,
  );

export const relativeDays = (from: string, to: string) => {
  const n = daysBetween(from, to);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
};

export function download(
  name: string,
  text: string,
  type = "text/csv",
): void {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
