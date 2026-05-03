import type { TransactionType } from "../types/finance";

export type DuplicateParts = {
  incurredDate: string;
  amountCents: number;
  description: string;
  accountKey: string;
};

export function buildDuplicateKey(parts: DuplicateParts): string {
  const desc = parts.description.trim().toLowerCase().slice(0, 120);
  return `${parts.incurredDate}|${parts.amountCents}|${parts.accountKey}|${desc}`;
}

/** Rough 0–1 score when comparing two keys (exact match = 1). */
export function duplicateConfidence(a: string, b: string): number {
  if (a === b) return 1;
  const [da, aa, ak, ...restA] = a.split("|");
  const [db, ab, bk, ...restB] = b.split("|");
  void restA;
  void restB;
  let score = 0;
  if (da === db) score += 0.35;
  if (aa === ab) score += 0.35;
  if (ak === bk) score += 0.15;
  return score;
}

export function inferLedgerMultiplier(
  type: TransactionType,
  role: "primary" | "from" | "to",
): number {
  if (type === "transfer") {
    if (role === "from") return -1;
    if (role === "to") return 1;
    return 0;
  }
  if (type === "expense" || type === "fee" || type === "interest") return -1;
  if (type === "income") return 1;
  if (type === "payment") return 1;
  return 0;
}
