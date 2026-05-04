import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { assertIsoDate } from "./lib/datesIso";
import { recountImportJob } from "./importWorkflowSteps";
import { createAccountRecord, normalizeOptionalString } from "./lib/accountRecords";
import {
  acceptImportRowRecord,
  applyReadyImportRows,
  buildAccountMetadataWarnings,
  buildSuggestedDraftFromSuggestion,
  findMatchingAccountForSuggestion,
  recomputeJobRowStateForAccount,
  reclassifyEditedRow,
} from "./lib/importReview";
import { syncStatementReconciliation } from "./lib/statementReconciliation";
import { workflowManager } from "./lib/workflow";
import { summarizeImportRows } from "../src/lib/import-review";
import {
  accountSuggestionValidator,
  accountSubtypeValidator,
  accountTypeValidator,
  postingStatusValidator,
  transactionTypeValidator,
} from "./validators";
import type { WorkflowId } from "@convex-dev/workflow";

export const listImportJobs = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx): Promise<Doc<"importJobs">[]> => {
    assertSingleUserLocalMode();
    return await ctx.db.query("importJobs").order("desc").take(200);
  },
});

export const listImportRows = query({
  args: { importJobId: v.id("importJobs") },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Doc<"importRows">[]> => {
    assertSingleUserLocalMode();
    return await ctx.db
      .query("importRows")
      .withIndex("by_job_row", (q) => q.eq("importJobId", args.importJobId))
      .collect();
  },
});

export const getAccountSuggestionForJob = query({
  args: { importJobId: v.id("importJobs") },
  returns: v.union(accountSuggestionValidator, v.null()),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const job = await ctx.db.get(args.importJobId);
    return job?.accountSuggestion ?? null;
  },
});

export const getImportReviewWorkspace = query({
  args: { importJobId: v.id("importJobs") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const job = await ctx.db.get(args.importJobId);
    if (!job) return null;

    const statementFile = await ctx.db.get(job.statementFileId);
    const account = job.accountId ? await ctx.db.get(job.accountId) : null;
    const rows = await ctx.db
      .query("importRows")
      .withIndex("by_job_row", (q) => q.eq("importJobId", args.importJobId))
      .collect();
    const fileUrl =
      statementFile && statementFile.originalStorageStatus === "available"
        ? await ctx.storage.getUrl(statementFile.storageId)
        : null;
    const summary = summarizeImportRows(rows);

    return {
      job,
      statementFile,
      account,
      fileUrl,
      rows,
      summary,
      readyRows: rows.filter((row) => row.status === "needsReview"),
      exceptionRows: rows.filter(
        (row) => row.status === "duplicate" || row.status === "error",
      ),
      canApplyReadyRows: summary.canApplyReadyRows && Boolean(job.accountId),
      suggestedAccountDraft: buildSuggestedDraftFromSuggestion(job.accountSuggestion),
    };
  },
});

/**
 * Re-run parsing for an import job. Useful when the workflow died (for example
 * before this fix, when an unhandled parser exception left the job stuck in
 * `processing`) or when a transient `failed` status should be retried after
 * fixing config such as `FIRECRAWL_API_KEY`.
 *
 * The mutation:
 * - Cancels and cleans up the old workflow attempt if one is recorded.
 * - Removes any importRows that have not been accepted yet (rejected /
 *   duplicate / error / needsReview rows came from the previous attempt and
 *   should be replaced by the new parse). Accepted rows are preserved so we
 *   never silently destroy ledger transactions the user already promoted.
 * - Resets job + statementFile status back to `queued` and clears any
 *   redacted error.
 * - Starts a fresh workflow.
 */
export const retryImportJob = mutation({
  args: { importJobId: v.id("importJobs") },
  returns: v.object({
    workflowId: v.string(),
    clearedRowCount: v.number(),
  }),
  handler: async (ctx, args): Promise<{
    workflowId: string;
    clearedRowCount: number;
  }> => {
    assertSingleUserLocalMode();
    const job = await ctx.db.get(args.importJobId);
    if (!job) throw new Error("Import job not found");

    if (job.status === "accepted") {
      throw new Error(
        "Cannot retry an accepted job. Reject the rows or delete the file first.",
      );
    }

    if (job.workflowId) {
      try {
        await workflowManager.cancel(ctx, job.workflowId as WorkflowId);
      } catch {
        // The workflow may already be in a terminal state; ignore.
      }
      try {
        await workflowManager.cleanup(ctx, job.workflowId as WorkflowId);
      } catch {
        // Cleanup is best-effort.
      }
    }

    const existingRows = await ctx.db
      .query("importRows")
      .withIndex("by_job_row", (q) => q.eq("importJobId", args.importJobId))
      .collect();

    let clearedRowCount = 0;
    for (const row of existingRows) {
      if (row.status === "accepted") continue;
      await ctx.db.delete(row._id);
      clearedRowCount += 1;
    }

    const now = Date.now();
    await ctx.db.patch(args.importJobId, {
      status: "queued",
      progressStage: "queued",
      progressMessage: "Queued for retry.",
      progressPercent: 0,
      redactedError: undefined,
      parserId: undefined,
      accountSuggestion: undefined,
      parserWarnings: undefined,
      accountMetadataWarnings: undefined,
      reconciliationStatus: undefined,
      provisionalReason: undefined,
      reconciliationDetail: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(job.statementFileId, {
      status: "queued",
      redactedError: undefined,
      updatedAt: now,
    });

    const workflowId = await workflowManager.start(
      ctx,
      internal.importWorkflow.importStatementWorkflow,
      { importJobId: args.importJobId },
    );

    await ctx.db.patch(args.importJobId, {
      workflowId,
      updatedAt: Date.now(),
    });

    return { workflowId, clearedRowCount };
  },
});

export const updateReviewRow = mutation({
  args: {
    importRowId: v.id("importRows"),
    normalizedDescription: v.optional(v.string()),
    normalizedCategory: v.optional(v.string()),
    normalizedIncurredDate: v.optional(v.string()),
    normalizedTransactionDate: v.optional(v.string()),
    normalizedPostedDate: v.optional(v.string()),
    normalizedAmountCents: v.optional(v.number()),
    normalizedType: v.optional(transactionTypeValidator),
    accountId: v.optional(v.id("accounts")),
    originalDescription: v.optional(v.string()),
    memo: v.optional(v.string()),
    merchantName: v.optional(v.string()),
    normalizedMerchantName: v.optional(v.string()),
    bankTransactionId: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    checkNumber: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    importedBalanceCents: v.optional(v.number()),
    postingStatus: v.optional(postingStatusValidator),
    pendingMatchesKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const row = await ctx.db.get(args.importRowId);
    if (!row) throw new Error("Import row not found");
    if (row.status === "accepted") {
      throw new Error("Accepted import rows cannot be edited here");
    }

    const patch: Partial<Doc<"importRows">> = { updatedAt: Date.now() };

    if (args.normalizedDescription !== undefined) {
      const d = args.normalizedDescription.trim();
      if (d.length === 0) throw new Error("Description is required");
      patch.normalizedDescription = d;
    }
    if (args.normalizedCategory !== undefined) {
      patch.normalizedCategory = normalizeOptionalString(args.normalizedCategory);
    }
    if (args.normalizedIncurredDate !== undefined) {
      assertIsoDate("Incurred date", args.normalizedIncurredDate);
      patch.normalizedIncurredDate = args.normalizedIncurredDate;
    }
    if (args.normalizedTransactionDate !== undefined) {
      if (args.normalizedTransactionDate.trim().length > 0) {
        assertIsoDate("Transaction date", args.normalizedTransactionDate);
      }
      patch.normalizedTransactionDate = normalizeOptionalString(args.normalizedTransactionDate);
    }
    if (args.normalizedPostedDate !== undefined) {
      if (args.normalizedPostedDate.trim().length > 0) {
        assertIsoDate("Posted date", args.normalizedPostedDate);
      }
      patch.normalizedPostedDate = normalizeOptionalString(args.normalizedPostedDate);
    }
    if (args.normalizedAmountCents !== undefined) {
      if (args.normalizedAmountCents <= 0 || !Number.isFinite(args.normalizedAmountCents)) {
        throw new Error("Amount must be positive cents");
      }
      patch.normalizedAmountCents = args.normalizedAmountCents;
    }
    if (args.normalizedType !== undefined) patch.normalizedType = args.normalizedType;
    if (args.accountId !== undefined) {
      if (args.accountId) {
        const acct = await ctx.db.get(args.accountId);
        if (!acct) throw new Error("Account not found");
      }
      patch.accountId = args.accountId;
    }
    if (args.originalDescription !== undefined) {
      patch.originalDescription = normalizeOptionalString(args.originalDescription);
    }
    if (args.memo !== undefined) {
      patch.memo = normalizeOptionalString(args.memo);
    }
    if (args.merchantName !== undefined) {
      patch.merchantName = normalizeOptionalString(args.merchantName);
    }
    if (args.normalizedMerchantName !== undefined) {
      patch.normalizedMerchantName = normalizeOptionalString(args.normalizedMerchantName);
    }
    if (args.bankTransactionId !== undefined) {
      patch.bankTransactionId = normalizeOptionalString(args.bankTransactionId);
    }
    if (args.referenceNumber !== undefined) {
      patch.referenceNumber = normalizeOptionalString(args.referenceNumber);
    }
    if (args.checkNumber !== undefined) {
      patch.checkNumber = normalizeOptionalString(args.checkNumber);
    }
    if (args.currencyCode !== undefined) {
      patch.currencyCode = normalizeOptionalString(args.currencyCode);
    }
    if (args.importedBalanceCents !== undefined) {
      patch.importedBalanceCents = args.importedBalanceCents;
    }
    if (args.postingStatus !== undefined) {
      patch.postingStatus = args.postingStatus;
    }
    if (args.pendingMatchesKey !== undefined) {
      patch.pendingMatchesKey = normalizeOptionalString(args.pendingMatchesKey);
    }

    await ctx.db.patch(args.importRowId, patch);
    await reclassifyEditedRow(ctx, args.importRowId);
    await syncStatementReconciliation(ctx, row.importJobId);
    await recountImportJob(ctx, row.importJobId);
    return null;
  },
});

export const acceptImportRow = mutation({
  args: {
    importRowId: v.id("importRows"),
    forceAcceptDuplicate: v.optional(v.boolean()),
    /** When true, mark imported rows cleared as of incurred date */
    markCleared: v.optional(v.boolean()),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args): Promise<Id<"transactions">> => {
    assertSingleUserLocalMode();
    const row = await ctx.db.get(args.importRowId);
    if (!row) throw new Error("Import row not found");
    const job = await ctx.db.get(row.importJobId);
    if (!job) throw new Error("Import job not found");

    const transactionId = await acceptImportRowRecord(ctx, row, job, args);
    await syncStatementReconciliation(ctx, row.importJobId);
    await recountImportJob(ctx, row.importJobId);
    return transactionId;
  },
});

export const rejectImportRow = mutation({
  args: { importRowId: v.id("importRows") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const row = await ctx.db.get(args.importRowId);
    if (!row) throw new Error("Import row not found");
    if (row.acceptedTransactionId) {
      throw new Error("Cannot reject a row that was already accepted");
    }

    await ctx.db.patch(args.importRowId, {
      status: "rejected",
      updatedAt: Date.now(),
    });
    await syncStatementReconciliation(ctx, row.importJobId);
    await recountImportJob(ctx, row.importJobId);
    return null;
  },
});

export const rejectAllImportRows = mutation({
  args: { importJobId: v.id("importJobs") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const rows = await ctx.db
      .query("importRows")
      .withIndex("by_job_row", (q) => q.eq("importJobId", args.importJobId))
      .collect();

    for (const row of rows) {
      if (row.status === "accepted") continue;
      await ctx.db.patch(row._id, {
        status: "rejected",
        updatedAt: Date.now(),
      });
    }
    await syncStatementReconciliation(ctx, args.importJobId);
    await recountImportJob(ctx, args.importJobId);
    return null;
  },
});

export const applyImportJobReadyRows = mutation({
  args: { importJobId: v.id("importJobs") },
  returns: v.object({ appliedCount: v.number() }),
  handler: async (ctx, args): Promise<{ appliedCount: number }> => {
    assertSingleUserLocalMode();
    const appliedCount = await applyReadyImportRows(ctx, args.importJobId);
    await syncStatementReconciliation(ctx, args.importJobId);
    await recountImportJob(ctx, args.importJobId);
    return { appliedCount };
  },
});

export const linkImportJobToAccount = mutation({
  args: {
    importJobId: v.id("importJobs"),
    accountId: v.optional(v.id("accounts")),
    accountDraft: v.optional(
      v.object({
        name: v.string(),
        type: accountTypeValidator,
        subtype: accountSubtypeValidator,
        initialBalanceCents: v.optional(v.number()),
      }),
    ),
  },
  returns: v.object({
    accountId: v.id("accounts"),
    matchedExisting: v.boolean(),
    autoAppliedCount: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    accountId: Id<"accounts">;
    matchedExisting: boolean;
    autoAppliedCount: number;
  }> => {
    assertSingleUserLocalMode();
    const job = await ctx.db.get(args.importJobId);
    if (!job) throw new Error("Import job not found");

    const statementFile = await ctx.db.get(job.statementFileId);
    if (!statementFile) throw new Error("Statement file not found");

    if (args.accountId && args.accountDraft) {
      throw new Error("Choose an existing account or provide a new account draft.");
    }

    let targetAccountId = args.accountId;
    let matchedExisting = Boolean(args.accountId);

    if (!targetAccountId && !args.accountDraft && job.accountSuggestion) {
      const matched = await findMatchingAccountForSuggestion(ctx, job.accountSuggestion);
      if (!matched) {
        throw new Error(
          "No matching account was found. Choose an existing account or create a new one.",
        );
      }
      targetAccountId = matched._id;
      matchedExisting = true;
    }

    if (!targetAccountId && args.accountDraft) {
      const suggestion = job.accountSuggestion;
      targetAccountId = await createAccountRecord(ctx, {
        name: args.accountDraft.name,
        type: args.accountDraft.type,
        subtype: args.accountDraft.subtype,
        issuer: job.accountSuggestion?.issuer,
        institution: job.accountSuggestion?.institution,
        lastFour: job.accountSuggestion?.lastFour,
        initialBalanceCents: args.accountDraft.initialBalanceCents ?? 0,
        creditLimitCents: job.accountSuggestion?.creditLimitCents,
        aprBps: job.accountSuggestion?.aprBps,
        statementDay: job.accountSuggestion?.statementDay,
        paymentDueDay: job.accountSuggestion?.paymentDueDay,
        lenderProfile:
          args.accountDraft.subtype === "creditCard" || suggestion?.aprBps !== undefined
            ? {
                aprBps: suggestion?.aprBps,
                statementDay: suggestion?.statementDay,
                paymentDueDay: suggestion?.paymentDueDay,
                interestMethod: "statementBalanceEstimate",
              }
            : undefined,
      });
      matchedExisting = false;
    }

    if (!targetAccountId) {
      throw new Error("Select an account or provide a new account draft.");
    }

    const account = await ctx.db.get(targetAccountId);
    if (!account) throw new Error("Account not found");

    const now = Date.now();
    const accountMetadataWarnings = buildAccountMetadataWarnings(
      account,
      job.accountSuggestion,
    );

    await ctx.db.patch(args.importJobId, {
      accountId: targetAccountId,
      accountMetadataWarnings,
      updatedAt: now,
    });
    await ctx.db.patch(statementFile._id, {
      accountId: targetAccountId,
      updatedAt: now,
    });

    await recomputeJobRowStateForAccount(ctx, args.importJobId, targetAccountId);
    await syncStatementReconciliation(ctx, args.importJobId);
    const autoAppliedCount = await applyReadyImportRows(ctx, args.importJobId, {
      onlyIfExceptionsPresent: true,
    });
    await recountImportJob(ctx, args.importJobId);

    if (autoAppliedCount > 0) {
      await ctx.db.patch(args.importJobId, {
        progressMessage: `Applied ${autoAppliedCount} clean row${autoAppliedCount === 1 ? "" : "s"}. Review flagged exceptions.`,
        updatedAt: Date.now(),
      });
    }

    return {
      accountId: targetAccountId,
      matchedExisting,
      autoAppliedCount,
    };
  },
});
