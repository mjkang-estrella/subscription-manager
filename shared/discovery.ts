import type { Subscription } from "./types.js";

export type ImportMapping = Partial<
  Record<
    | "merchant"
    | "amount"
    | "date"
    | "currency"
    | "debit"
    | "credit"
    | "cycle"
    | "domain"
    | "category"
    | "plan",
    string
  >
>;
export type ImportCandidate = Subscription & {
  confidence: "likely" | "possible";
  reason: string;
  selected: boolean;
  matchId?: string;
  requiresReview?: string[];
  sourceExcerpt?: string;
  inferredFields?: string[];
  /** Explicit field confirmations, including USD for a receipt with no currency. */
  reviewedFields?: ("price" | "currency" | "cycle" | "nextBilling")[];
};
export type ImportReport = {
  rowsRead: number;
  rowsAccepted: number;
  skipped: { row: number; reason: string; file?: string }[];
  skippedByReason: Record<string, number>;
  nonUsdByCurrency: Record<string, number>;
  truncated: boolean;
  candidateLimit: number;
  candidatesOmitted: number;
  warnings: string[];
};
export type DiscoveryInput = {
  type: "csv" | "email";
  text?: string;
  files?: { name: string; text: string }[];
  mapping?: ImportMapping;
  dateOrder?: "MDY" | "DMY" | "YMD";
  chargeSign?: "positive" | "negative";
};
export type DiscoveryResult = {
  candidates: ImportCandidate[];
  report: ImportReport;
};
