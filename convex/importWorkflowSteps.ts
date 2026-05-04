import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildTransactionDuplicateKey } from "./lib/ids";
import { syncStatementReconciliation } from "./lib/statementReconciliation";
import {
  accountSuggestionValidator,
  normalizedRowValidator,
} from "./validators";

export const getJobContext = internalQuery({
  args: { importJobId: v.id("importJobs") },
  returns: v.union(
    v.object({
      importJobId: v.id("importJobs"),
      statementFileId: v.id("statementFiles"),
      storageId: v.id("_storage"),
      fileName: v.string(),
      contentType: v.string(),
      sizeBytes: v.number(),
      sha256: v.optional(v.string()),
      accountId: v.optional(v.id("accounts")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.importJobId);
    if (!job) return null;
    const file = await ctx.db.get(job.statementFileId);
    if (!file) return null;
    return {
      importJobId: job._id,
      statementFileId: file._id,
      storageId: file.storageId,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      accountId: job.accountId,
    };
  },
});

export const markJobProcessing = internalMutation({
  args: { importJobId: v.id("importJobs") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.db.get(args.importJobId);
    if (!job) return null;
    const now = Date.now();
    await ctx.db.patch(args.importJobId, {
      status: "processing",
      updatedAt: now,
    });
    await ctx.db.patch(job.statementFileId, {
      status: "processing",
      updatedAt: now,
    });
    return null;
  },
});

export async function recountImportJob(
  ctx: MutationCtx,
  jobId: Id<"importJobs">,
): Promise<void> {
  const rows = await ctx.db
    .query("importRows")
    .withIndex("by_job_row", (q) => q.eq("importJobId", jobId))
    .collect();

  let acceptedCount = 0;
  let rejectedCount = 0;
  let duplicateCount = 0;
  for (const r of rows) {
    if (r.status === "accepted") acceptedCount++;
    else if (r.status === "rejected") rejectedCount++;
    else if (r.status === "duplicate") duplicateCount++;
  }

  const needsAttention = rows.some(
    (r) =>
      r.status === "needsReview" ||
      r.status === "duplicate" ||
      r.status === "error",
  );

  const job = await ctx.db.get(jobId);
  if (!job) return;

  let status = job.status;
  if (job.status !== "failed" && job.status !== "cancelled") {
    if (rows.length > 0 && !job.accountId) status = "needsAccountLink";
    else if (rows.length === 0) status = "needsReview";
    else if (needsAttention) status = "needsReview";
    else status = "accepted";
  }

  await ctx.db.patch(jobId, {
    rowCount: rows.length,
    acceptedCount,
    rejectedCount,
    duplicateCount,
    status,
    updatedAt: Date.now(),
  });
}

export const persistParseResults = internalMutation({
  args: {
    importJobId: v.id("importJobs"),
    parserId: v.string(),
    accountSuggestion: v.optional(accountSuggestionValidator),
    fatalError: v.optional(v.string()),
    rows: v.array(normalizedRowValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.db.get(args.importJobId);
    if (!job) return null;
    const now = Date.now();

    await ctx.db.patch(args.importJobId, {
      parserId: args.parserId,
      accountSuggestion: args.accountSuggestion,
      updatedAt: now,
    });

    if (args.fatalError) {
      await ctx.db.patch(args.importJobId, {
        status: "failed",
        redactedError: args.fatalError,
        updatedAt: now,
      });
      await ctx.db.patch(job.statementFileId, {
        status: "failed",
        redactedError: args.fatalError,
        updatedAt: now,
      });
      return null;
    }

    const seenKeys = new Set<string>();
    const seenBankIds = new Set<string>();

    for (const row of args.rows) {
      const duplicateKey = buildTransactionDuplicateKey({
        incurredDate: row.normalizedIncurredDate,
        amountCents: row.normalizedAmountCents,
        description: row.normalizedDescription,
        accountKey: job.accountId ?? "unassigned",
      });

      let status: Doc<"importRows">["status"] = row.rowError
        ? "error"
        : "needsReview";
      let dupKey: string | undefined = duplicateKey;

      if (!row.rowError) {
        let markDup = false;
        if (seenKeys.has(duplicateKey)) markDup = true;
        else seenKeys.add(duplicateKey);

        if (!markDup) {
          const existingTx = await ctx.db
            .query("transactions")
            .withIndex("by_duplicateKey", (q) =>
              q.eq("duplicateKey", duplicateKey),
            )
            .first();
          if (existingTx) markDup = true;
        }

        const bankId = row.bankTransactionId?.trim();
        if (!markDup && bankId) {
          if (seenBankIds.has(bankId)) markDup = true;
          else seenBankIds.add(bankId);
        }
        if (!markDup && bankId && job.accountId) {
          const existingBank = await ctx.db
            .query("transactions")
            .withIndex("by_bank_transaction_id", (q) =>
              q.eq("bankTransactionId", bankId),
            )
            .first();
          if (existingBank && existingBank.accountId === job.accountId) {
            markDup = true;
          }
        }

        if (markDup) status = "duplicate";
      } else {
        dupKey = undefined;
      }

      const existing = await ctx.db
        .query("importRows")
        .withIndex("by_job_row", (q) =>
          q.eq("importJobId", args.importJobId).eq("rowIndex", row.rowIndex),
        )
        .first();

      const payload = {
        importJobId: args.importJobId,
        statementFileId: job.statementFileId,
        accountId: job.accountId,
        status,
        rowIndex: row.rowIndex,
        rawSummary: row.rawSummary,
        normalizedDescription: row.normalizedDescription,
        originalDescription: row.originalDescription,
        memo: row.memo,
        merchantName: row.merchantName,
        normalizedMerchantName: row.normalizedMerchantName,
        suggestedMerchantName: row.suggestedMerchantName,
        normalizedCategory: row.normalizedCategory,
        normalizedIncurredDate: row.normalizedIncurredDate,
        normalizedTransactionDate: row.normalizedTransactionDate,
        normalizedPostedDate: row.normalizedPostedDate,
        normalizedAmountCents: row.normalizedAmountCents,
        normalizedType: row.normalizedType,
        bankTransactionId: row.bankTransactionId,
        referenceNumber: row.referenceNumber,
        checkNumber: row.checkNumber,
        currencyCode: row.currencyCode,
        importedBalanceCents: row.importedBalanceCents,
        postingStatus: row.postingStatus,
        pendingMatchesKey: row.pendingMatchesKey,
        confidence: row.confidence,
        duplicateKey: dupKey,
        redactedError: row.rowError,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("importRows", {
          ...payload,
          createdAt: now,
        });
      }
    }

    const statementFile = await ctx.db.get(job.statementFileId);
    if (statementFile) {
      await ctx.db.patch(statementFile._id, {
        status: "parsed",
        updatedAt: now,
      });
    }

    await syncStatementReconciliation(ctx, args.importJobId);
    await recountImportJob(ctx, args.importJobId);
    return null;
  },
});

export const recountJobSideEffect = internalMutation({
  args: { importJobId: v.id("importJobs") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await recountImportJob(ctx, args.importJobId);
    return null;
  },
});
