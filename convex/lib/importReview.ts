import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertIsoDate } from "../lib/datesIso";
import { buildTransactionDuplicateKey } from "../lib/ids";
import { normalizedMerchantKey } from "../lib/merchantKey";
import { buildSuggestedAccountDraft, summarizeImportRows } from "../../src/lib/import-review";

export async function findBankDuplicateTransaction(
  ctx: QueryCtx,
  bankTransactionId: string | undefined,
  accountId: Id<"accounts">,
): Promise<Doc<"transactions"> | null> {
  const id = bankTransactionId?.trim();
  if (!id) return null;
  const hits = await ctx.db
    .query("transactions")
    .withIndex("by_bank_transaction_id", (q) => q.eq("bankTransactionId", id))
    .take(20);
  return hits.find((t) => t.accountId === accountId) ?? null;
}

export function buildAccountMetadataWarnings(
  account: Pick<
    Doc<"accounts">,
    | "name"
    | "issuer"
    | "institution"
    | "lastFour"
    | "creditLimitCents"
    | "aprBps"
    | "statementDay"
    | "paymentDueDay"
  >,
  suggestion: Doc<"importJobs">["accountSuggestion"],
): string[] {
  if (!suggestion) return [];

  const warnings: string[] = [];

  if (account.issuer && account.issuer !== suggestion.issuer) {
    warnings.push(
      `Statement issuer ${suggestion.issuer} differs from account issuer ${account.issuer}.`,
    );
  }
  if (
    account.institution &&
    suggestion.institution &&
    account.institution !== suggestion.institution
  ) {
    warnings.push(
      `Statement institution ${suggestion.institution} differs from account institution ${account.institution}.`,
    );
  }
  if (account.lastFour && account.lastFour !== suggestion.lastFour) {
    warnings.push(
      `Statement last four ${suggestion.lastFour} differs from account last four ${account.lastFour}.`,
    );
  }
  if (
    suggestion.creditLimitCents !== undefined &&
    account.creditLimitCents !== undefined &&
    suggestion.creditLimitCents !== account.creditLimitCents
  ) {
    warnings.push("Statement credit limit differs from the existing account.");
  }
  if (
    suggestion.aprBps !== undefined &&
    account.aprBps !== undefined &&
    suggestion.aprBps !== account.aprBps
  ) {
    warnings.push("Statement APR differs from the existing account.");
  }
  if (
    suggestion.statementDay !== undefined &&
    account.statementDay !== undefined &&
    suggestion.statementDay !== account.statementDay
  ) {
    warnings.push("Statement day differs from the existing account.");
  }
  if (
    suggestion.paymentDueDay !== undefined &&
    account.paymentDueDay !== undefined &&
    suggestion.paymentDueDay !== account.paymentDueDay
  ) {
    warnings.push("Payment due day differs from the existing account.");
  }

  return warnings;
}

export async function findMatchingAccountForSuggestion(
  ctx: QueryCtx,
  suggestion: Doc<"importJobs">["accountSuggestion"],
): Promise<Doc<"accounts"> | null> {
  if (!suggestion) return null;

  const exact = await ctx.db
    .query("accounts")
    .withIndex("by_issuer_lastFour", (q) =>
      q.eq("issuer", suggestion.issuer).eq("lastFour", suggestion.lastFour),
    )
    .first();
  if (exact) return exact;

  const accounts = await ctx.db.query("accounts").collect();
  const normalizedIssuer = suggestion.issuer.trim().toLowerCase();
  const normalizedInstitution = suggestion.institution?.trim().toLowerCase();

  return (
    accounts.find((account) => {
      if (!account.lastFour || account.lastFour !== suggestion.lastFour) return false;
      if (account.issuer?.trim().toLowerCase() === normalizedIssuer) return true;
      if (
        normalizedInstitution &&
        account.institution?.trim().toLowerCase() === normalizedInstitution
      ) {
        return true;
      }
      return account.name.trim().toLowerCase().includes(normalizedIssuer);
    }) ?? null
  );
}

export async function syncLenderProfileFromSuggestion(
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
    if (suggestion.statementDay !== undefined) patch.statementDay = suggestion.statementDay;
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

export async function recomputeJobRowStateForAccount(
  ctx: MutationCtx,
  importJobId: Id<"importJobs">,
  accountId: Id<"accounts">,
): Promise<void> {
  const rows = await ctx.db
    .query("importRows")
    .withIndex("by_job_row", (q) => q.eq("importJobId", importJobId))
    .collect();

  const seenKeys = new Set<string>();
  const seenBankIds = new Set<string>();
  const now = Date.now();

  for (const row of rows) {
    const validationError = validateImportRowForReview(row);
    if (validationError) {
      await ctx.db.patch(row._id, {
        accountId,
        duplicateKey: undefined,
        status: "error",
        redactedError: validationError,
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

    const bankId = row.bankTransactionId?.trim();

    let status = row.status;
    if (row.status !== "accepted" && row.status !== "rejected") {
      let markDuplicate = seenKeys.has(duplicateKey);
      if (!markDuplicate) seenKeys.add(duplicateKey);

      if (!markDuplicate && bankId) {
        if (seenBankIds.has(bankId)) markDuplicate = true;
        else seenBankIds.add(bankId);
      }

      if (!markDuplicate) {
        const existingTx = await ctx.db
          .query("transactions")
          .withIndex("by_duplicateKey", (q) => q.eq("duplicateKey", duplicateKey))
          .first();
        if (existingTx) markDuplicate = true;
      }

      if (!markDuplicate && bankId) {
        const bankHit = await findBankDuplicateTransaction(ctx, bankId, accountId);
        if (bankHit) markDuplicate = true;
      }

      status = markDuplicate ? "duplicate" : "needsReview";
    }

    await ctx.db.patch(row._id, {
      accountId,
      duplicateKey,
      status,
      redactedError: undefined,
      updatedAt: now,
    });
  }
}

export function validateImportRowForReview(
  row: Pick<
    Doc<"importRows">,
    "normalizedDescription" | "normalizedIncurredDate" | "normalizedAmountCents"
  >,
): string | null {
  const description = row.normalizedDescription.trim();
  if (description.length === 0) return "Description is required";

  try {
    assertIsoDate("Incurred date", row.normalizedIncurredDate);
  } catch {
    return "Valid incurred date is required";
  }

  if (
    !Number.isFinite(row.normalizedAmountCents) ||
    row.normalizedAmountCents <= 0
  ) {
    return "Amount must be positive cents";
  }

  return null;
}

export async function reclassifyEditedRow(
  ctx: MutationCtx,
  rowId: Id<"importRows">,
): Promise<void> {
  const row = await ctx.db.get(rowId);
  if (!row) return;
  if (row.status === "accepted" || row.status === "rejected") return;

  const validationError = validateImportRowForReview(row);
  if (validationError) {
    await ctx.db.patch(rowId, {
      status: "error",
      duplicateKey: undefined,
      redactedError: validationError,
      updatedAt: Date.now(),
    });
    return;
  }

  const job = await ctx.db.get(row.importJobId);
  if (!job) return;

  const accountId = row.accountId ?? job.accountId;
  const duplicateKey = buildTransactionDuplicateKey({
    incurredDate: row.normalizedIncurredDate,
    amountCents: row.normalizedAmountCents,
    description: row.normalizedDescription,
    accountKey: accountId ?? "unassigned",
  });

  let markDuplicate = false;
  const existingTx = await ctx.db
    .query("transactions")
    .withIndex("by_duplicateKey", (q) => q.eq("duplicateKey", duplicateKey))
    .first();
  if (existingTx) markDuplicate = true;

  if (!markDuplicate && accountId) {
    const bankHit = await findBankDuplicateTransaction(ctx, row.bankTransactionId, accountId);
    markDuplicate = Boolean(bankHit);
  }

  await ctx.db.patch(rowId, {
    status: markDuplicate ? "duplicate" : "needsReview",
    duplicateKey,
    redactedError: undefined,
    updatedAt: Date.now(),
  });
}

async function resolveMerchantIdFromRow(
  ctx: MutationCtx,
  row: Doc<"importRows">,
): Promise<Id<"merchants"> | undefined> {
  const raw = row.normalizedMerchantName?.trim() ?? row.merchantName?.trim();
  if (!raw) return undefined;
  const key = normalizedMerchantKey(raw);
  if (key.length === 0) return undefined;
  const direct = await ctx.db
    .query("merchants")
    .withIndex("by_normalized_key", (q) => q.eq("normalizedKey", key))
    .first();
  if (direct) return direct._id;
  const alias = await ctx.db
    .query("merchantAliases")
    .withIndex("by_alias_pattern", (q) => q.eq("aliasPattern", key))
    .first();
  return alias?.merchantId;
}

export async function acceptImportRowRecord(
  ctx: MutationCtx,
  row: Doc<"importRows">,
  job: Doc<"importJobs">,
  args?: {
    forceAcceptDuplicate?: boolean;
    markCleared?: boolean;
  },
): Promise<Id<"transactions">> {
  if (row.acceptedTransactionId) {
    return row.acceptedTransactionId;
  }

  if (row.status === "error") {
    throw new Error("Cannot accept a row that failed validation");
  }
  if (row.status === "rejected") {
    throw new Error("Cannot accept a rejected row");
  }
  if (row.status === "duplicate" && !args?.forceAcceptDuplicate) {
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
  const bankDupTx = await findBankDuplicateTransaction(ctx, row.bankTransactionId, accountId);

  if (duplicateTx && bankDupTx && duplicateTx._id !== bankDupTx._id) {
    throw new Error(
      "Conflicting duplicates: composite key and bank id match different existing transactions.",
    );
  }

  if (!args?.forceAcceptDuplicate) {
    if (duplicateTx) {
      throw new Error("A matching transaction already exists for this row.");
    }
    if (bankDupTx) {
      throw new Error(
        "A transaction with this bank transaction id already exists for this account.",
      );
    }
  }

  if (args?.forceAcceptDuplicate) {
    const target = duplicateTx ?? bankDupTx;
    if (target) {
      await ctx.db.patch(row._id, {
        status: "accepted",
        acceptedTransactionId: target._id,
        duplicateKey,
        redactedError: undefined,
        updatedAt: Date.now(),
      });
      return target._id;
    }
  }

  const markCleared = args?.markCleared ?? false;
  const clearedDate = markCleared ? row.normalizedIncurredDate : undefined;

  const merchantId = await resolveMerchantIdFromRow(ctx, row);
  const now = Date.now();
  const transactionId = await ctx.db.insert("transactions", {
    type: row.normalizedType,
    amountCents: row.normalizedAmountCents,
    accountId,
    description,
    category: row.normalizedCategory,
    incurredDate: row.normalizedIncurredDate,
    transactionDate: row.normalizedTransactionDate?.trim() || undefined,
    postedDate: row.normalizedPostedDate?.trim() || undefined,
    merchantName: row.merchantName?.trim() || undefined,
    merchantId,
    originalDescription: row.originalDescription?.trim() || description,
    memo: row.memo?.trim() || undefined,
    bankTransactionId: row.bankTransactionId?.trim() || undefined,
    referenceNumber: row.referenceNumber?.trim() || undefined,
    checkNumber: row.checkNumber?.trim() || undefined,
    currencyCode: row.currencyCode?.trim() || undefined,
    importedBalanceCents: row.importedBalanceCents,
    postingStatus: row.postingStatus ?? "posted",
    pendingMatchesKey: row.pendingMatchesKey?.trim() || undefined,
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
    redactedError: undefined,
    updatedAt: Date.now(),
  });

  return transactionId;
}

export async function applyReadyImportRows(
  ctx: MutationCtx,
  importJobId: Id<"importJobs">,
  options?: { onlyIfExceptionsPresent?: boolean },
): Promise<number> {
  const rows = await ctx.db
    .query("importRows")
    .withIndex("by_job_row", (q) => q.eq("importJobId", importJobId))
    .collect();
  const job = await ctx.db.get(importJobId);
  if (!job?.accountId) return 0;

  const summary = summarizeImportRows(rows);
  if (options?.onlyIfExceptionsPresent && !summary.shouldAutoApplyReadyRows) {
    return 0;
  }

  let appliedCount = 0;
  for (const row of rows) {
    if (row.status !== "needsReview") continue;
    await acceptImportRowRecord(ctx, row, job);
    appliedCount += 1;
  }
  return appliedCount;
}

export function buildSuggestedDraftFromSuggestion(
  suggestion: Doc<"importJobs">["accountSuggestion"],
) {
  return buildSuggestedAccountDraft(suggestion);
}
