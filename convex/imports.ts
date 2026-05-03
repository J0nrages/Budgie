import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { assertIsoDate } from "./lib/datesIso";
import { recountImportJob } from "./importWorkflowSteps";
import { buildTransactionDuplicateKey } from "./lib/ids";
import {
  accountSuggestionValidator,
  accountSubtypeValidator,
  accountTypeValidator,
  transactionTypeValidator,
} from "./validators";

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t.length === 0 ? undefined : t;
}

function hasAccountPatchContent(patch: Partial<Doc<"accounts">>): boolean {
  return Object.keys(patch).some((key) => key !== "updatedAt");
}

function buildAccountSuggestionPatch(
  account: Doc<"accounts">,
  suggestion: Doc<"importJobs">["accountSuggestion"],
): Partial<Doc<"accounts">> {
  if (!suggestion) return {};

  const patch: Partial<Doc<"accounts">> = {};
  if (account.issuer !== suggestion.issuer) patch.issuer = suggestion.issuer;
  if (
    suggestion.institution !== undefined &&
    account.institution !== suggestion.institution
  ) {
    patch.institution = suggestion.institution;
  }
  if (account.lastFour !== suggestion.lastFour) patch.lastFour = suggestion.lastFour;
  if (
    suggestion.creditLimitCents !== undefined &&
    account.creditLimitCents !== suggestion.creditLimitCents
  ) {
    patch.creditLimitCents = suggestion.creditLimitCents;
  }
  if (suggestion.aprBps !== undefined && account.aprBps !== suggestion.aprBps) {
    patch.aprBps = suggestion.aprBps;
  }
  if (
    suggestion.statementDay !== undefined &&
    account.statementDay !== suggestion.statementDay
  ) {
    patch.statementDay = suggestion.statementDay;
  }
  if (
    suggestion.paymentDueDay !== undefined &&
    account.paymentDueDay !== suggestion.paymentDueDay
  ) {
    patch.paymentDueDay = suggestion.paymentDueDay;
  }

  return patch;
}

async function syncLenderProfileFromSuggestion(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  suggestion: Doc<"importJobs">["accountSuggestion"],
  now: number,
): Promise<void> {
  if (
    !suggestion ||
    (suggestion.aprBps === undefined &&
      suggestion.statementDay === undefined &&
      suggestion.paymentDueDay === undefined)
  ) {
    return;
  }

  const existing = await ctx.db
    .query("lenderProfiles")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();

  if (existing) {
    const patch: Partial<Doc<"lenderProfiles">> = { updatedAt: now };
    if (suggestion.aprBps !== undefined) patch.aprBps = suggestion.aprBps;
    if (suggestion.statementDay !== undefined) {
      patch.statementDay = suggestion.statementDay;
    }
    if (suggestion.paymentDueDay !== undefined) {
      patch.paymentDueDay = suggestion.paymentDueDay;
    }
    await ctx.db.patch(existing._id, patch);
    return;
  }

  await ctx.db.insert("lenderProfiles", {
    accountId,
    aprBps: suggestion.aprBps,
    statementDay: suggestion.statementDay,
    paymentDueDay: suggestion.paymentDueDay,
    interestMethod: "statementBalanceEstimate",
    createdAt: now,
    updatedAt: now,
  });
}

async function recomputeJobRowStateForAccount(
  ctx: MutationCtx,
  importJobId: Id<"importJobs">,
  accountId: Id<"accounts">,
): Promise<void> {
  const rows = await ctx.db
    .query("importRows")
    .withIndex("by_job_row", (q) => q.eq("importJobId", importJobId))
    .collect();

  const seenKeys = new Set<string>();
  const now = Date.now();

  for (const row of rows) {
    if (row.status === "error") {
      await ctx.db.patch(row._id, {
        accountId,
        duplicateKey: undefined,
        updatedAt: now,
      });
      continue;
    }

    const duplicateKey = buildTransactionDuplicateKey({
      incurredDate: row.normalizedIncurredDate,
      amountCents: row.normalizedAmountCents,
      description: row.normalizedDescription,
      accountKey: accountId,
    });

    let status = row.status;
    if (row.status !== "accepted" && row.status !== "rejected") {
      let markDuplicate = seenKeys.has(duplicateKey);
      if (!markDuplicate) seenKeys.add(duplicateKey);

      if (!markDuplicate) {
        const existingTx = await ctx.db
          .query("transactions")
          .withIndex("by_duplicateKey", (q) => q.eq("duplicateKey", duplicateKey))
          .first();
        if (existingTx) markDuplicate = true;
      }

      status = markDuplicate ? "duplicate" : "needsReview";
    }

    await ctx.db.patch(row._id, {
      accountId,
      duplicateKey,
      status,
      updatedAt: now,
    });
  }
}

async function refreshRowDuplicateState(
  ctx: MutationCtx,
  row: Doc<"importRows">,
): Promise<void> {
  if (row.status === "accepted" || row.status === "rejected") return;

  const job = await ctx.db.get(row.importJobId);
  if (!job) return;

  const duplicateKey = buildTransactionDuplicateKey({
    incurredDate: row.normalizedIncurredDate,
    amountCents: row.normalizedAmountCents,
    description: row.normalizedDescription,
    accountKey: row.accountId ?? job.accountId ?? "unassigned",
  });

  let status: Doc<"importRows">["status"] = row.status;
  if (row.status === "error") {
    return;
  }

  const existingTx = await ctx.db
    .query("transactions")
    .withIndex("by_duplicateKey", (q) => q.eq("duplicateKey", duplicateKey))
    .first();
  status = existingTx ? "duplicate" : "needsReview";

  await ctx.db.patch(row._id, {
    duplicateKey,
    status,
    updatedAt: Date.now(),
  });
}

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

export const updateReviewRow = mutation({
  args: {
    importRowId: v.id("importRows"),
    normalizedDescription: v.optional(v.string()),
    normalizedCategory: v.optional(v.string()),
    normalizedIncurredDate: v.optional(v.string()),
    normalizedAmountCents: v.optional(v.number()),
    normalizedType: v.optional(transactionTypeValidator),
    accountId: v.optional(v.id("accounts")),
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

    await ctx.db.patch(args.importRowId, patch);
    const next = await ctx.db.get(args.importRowId);
    if (next) await refreshRowDuplicateState(ctx, next);
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

    if (row.acceptedTransactionId) {
      return row.acceptedTransactionId;
    }

    if (row.status === "error") {
      throw new Error("Cannot accept a row that failed validation");
    }
    if (row.status === "rejected") {
      throw new Error("Cannot accept a rejected row");
    }
    if (row.status === "duplicate" && !args.forceAcceptDuplicate) {
      throw new Error(
        "This row looks like a duplicate. Pass forceAcceptDuplicate to accept anyway.",
      );
    }

    const accountId = row.accountId ?? job.accountId;
    if (!accountId) {
      throw new Error("Link an account to the import job or row before accepting.");
    }

    const description = row.normalizedDescription.trim();
    if (description.length === 0) throw new Error("Description is required");

    assertIsoDate("Incurred date", row.normalizedIncurredDate);

    const duplicateKey = buildTransactionDuplicateKey({
      incurredDate: row.normalizedIncurredDate,
      amountCents: row.normalizedAmountCents,
      description,
      accountKey: accountId,
    });

    const duplicateTx = await ctx.db
      .query("transactions")
      .withIndex("by_duplicateKey", (q) => q.eq("duplicateKey", duplicateKey))
      .first();
    if (duplicateTx && !args.forceAcceptDuplicate) {
      throw new Error("A matching transaction already exists for this row.");
    }
    if (duplicateTx && args.forceAcceptDuplicate) {
      await ctx.db.patch(row._id, {
        status: "accepted",
        acceptedTransactionId: duplicateTx._id,
        duplicateKey,
        updatedAt: Date.now(),
      });
      await recountImportJob(ctx, row.importJobId);
      return duplicateTx._id;
    }

    const markCleared = args.markCleared ?? false;
    const clearedDate = markCleared ? row.normalizedIncurredDate : undefined;

    const now = Date.now();
    const transactionId = await ctx.db.insert("transactions", {
      type: row.normalizedType,
      amountCents: row.normalizedAmountCents,
      accountId,
      description,
      category: row.normalizedCategory,
      incurredDate: row.normalizedIncurredDate,
      isCleared: markCleared,
      clearedDate,
      sourceImportRowId: row._id,
      sourceStatementFileId: row.statementFileId,
      duplicateKey,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(row._id, {
      status: "accepted",
      acceptedTransactionId: transactionId,
      duplicateKey,
      updatedAt: Date.now(),
    });

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
    await recountImportJob(ctx, args.importJobId);
    return null;
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
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ accountId: Id<"accounts">; matchedExisting: boolean }> => {
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
      const suggestion = job.accountSuggestion;
      const matched = await ctx.db
        .query("accounts")
        .withIndex("by_issuer_lastFour", (q) =>
          q.eq("issuer", suggestion.issuer).eq("lastFour", suggestion.lastFour),
        )
        .first();
      if (!matched) {
        throw new Error(
          "No matching account was found. Choose an existing account or create a new one.",
        );
      }
      targetAccountId = matched._id;
      matchedExisting = true;
    }

    if (!targetAccountId && args.accountDraft) {
      const accountName = args.accountDraft.name.trim();
      if (accountName.length === 0) throw new Error("Account name is required");

      const now = Date.now();
      targetAccountId = await ctx.db.insert("accounts", {
        name: accountName,
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
        createdAt: now,
        updatedAt: now,
      });

      await syncLenderProfileFromSuggestion(
        ctx,
        targetAccountId,
        job.accountSuggestion,
        now,
      );
      matchedExisting = false;
    }

    if (!targetAccountId) {
      throw new Error("Select an account or provide a new account draft.");
    }

    const account = await ctx.db.get(targetAccountId);
    if (!account) throw new Error("Account not found");

    const now = Date.now();
    const accountPatch = buildAccountSuggestionPatch(account, job.accountSuggestion);
    if (hasAccountPatchContent(accountPatch)) {
      await ctx.db.patch(targetAccountId, {
        ...accountPatch,
        updatedAt: now,
      });
    }
    await syncLenderProfileFromSuggestion(
      ctx,
      targetAccountId,
      job.accountSuggestion,
      now,
    );

    await ctx.db.patch(args.importJobId, {
      accountId: targetAccountId,
      updatedAt: now,
    });
    await ctx.db.patch(statementFile._id, {
      accountId: targetAccountId,
      updatedAt: now,
    });

    await recomputeJobRowStateForAccount(ctx, args.importJobId, targetAccountId);
    await recountImportJob(ctx, args.importJobId);

    return {
      accountId: targetAccountId,
      matchedExisting,
    };
  },
});
