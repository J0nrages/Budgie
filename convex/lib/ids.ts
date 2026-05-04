import type { Id } from "../_generated/dataModel";

/**
 * Duplicate detection uses two paths:
 * - Composite `duplicateKey` (date + amount + description + account): fuzzy human-style dedupe.
 * - Optional `bankTransactionId` (FITID / institution id): strong identity when present; never
 *   silently merge — accept checks both; `forceAcceptDuplicate` bypasses both for intentional
 *   overrides. If composite says unique but bank id collides (or vice versa), surface as duplicate
 *   unless forced.
 */

export type DuplicateKeyParts = {
  incurredDate: string;
  amountCents: number;
  description: string;
  /** Primary posting account for expense/income, or fromAccount for transfers */
  accountKey: string;
};

export function buildTransactionDuplicateKey(parts: DuplicateKeyParts): string {
  const desc = parts.description.trim().toLowerCase().slice(0, 120);
  return `${parts.incurredDate}|${parts.amountCents}|${parts.accountKey}|${desc}`;
}

export function buildImportRowDeterministicKey(
  jobId: Id<"importJobs">,
  rowIndex: number,
): string {
  return `${jobId}:${rowIndex}`;
}
