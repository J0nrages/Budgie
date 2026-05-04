import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Signed effect of one import row on the account statement balance (asset vs liability). */
export function signedImportRowEffectOnBalance(
  normalizedType: Doc<"importRows">["normalizedType"],
  amountCents: number,
  accountType: Doc<"accounts">["type"],
): number {
  const a = amountCents;
  switch (normalizedType) {
    case "expense":
    case "fee":
    case "interest":
      return accountType === "asset" ? -a : a;
    case "income":
    case "payment":
      return accountType === "asset" ? a : -a;
    case "transfer":
      return 0;
  }
}

/** Recompute statement + job reconciliation from persisted file balances and import rows. */
export async function syncStatementReconciliation(
  ctx: MutationCtx,
  importJobId: Id<"importJobs">,
): Promise<void> {
  const job = await ctx.db.get(importJobId);
  if (!job) return;
  const statementFile = await ctx.db.get(job.statementFileId);
  if (!statementFile) return;

  const now = Date.now();
  const opening = statementFile.openingBalanceCents;
  const closing = statementFile.closingBalanceCents;
  const accountId = job.accountId;

  let reconciliationStatus: NonNullable<Doc<"statementFiles">["reconciliationStatus"]> =
    "unknown";
  let provisionalReason: string | undefined;
  let reconciliationDetail: string | undefined;

  if (opening === undefined || closing === undefined) {
    reconciliationStatus = "provisional";
    provisionalReason =
      "Opening or closing statement balance not available for this import.";
  } else if (!accountId) {
    reconciliationStatus = "provisional";
    provisionalReason =
      "Link account to reconcile statement opening and closing balances.";
  } else {
    const account = await ctx.db.get(accountId);
    if (!account) {
      reconciliationStatus = "provisional";
      provisionalReason = "Account missing; cannot reconcile balances.";
    } else {
      const rows = await ctx.db
        .query("importRows")
        .withIndex("by_job_row", (q) => q.eq("importJobId", importJobId))
        .collect();
      let sum = 0;
      for (const r of rows) {
        if (r.status === "error") continue;
        sum += signedImportRowEffectOnBalance(
          r.normalizedType,
          r.normalizedAmountCents,
          account.type,
        );
      }
      const expectedClose = opening + sum;
      const diff = expectedClose - closing;
      if (Math.abs(diff) <= 1) {
        reconciliationStatus = "matched";
        provisionalReason = undefined;
        reconciliationDetail = undefined;
      } else {
        reconciliationStatus = "mismatch";
        provisionalReason = undefined;
        reconciliationDetail = `Sum of import rows implies closing balance ${expectedClose}¢; statement shows ${closing}¢ (difference ${diff}¢).`;
      }
    }
  }

  await ctx.db.patch(statementFile._id, {
    reconciliationStatus,
    provisionalReason,
    reconciliationDetail,
    updatedAt: now,
  });
  await ctx.db.patch(importJobId, {
    reconciliationStatus,
    provisionalReason,
    reconciliationDetail,
    updatedAt: now,
  });
}
