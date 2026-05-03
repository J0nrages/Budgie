import type { Id } from "../_generated/dataModel";

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
