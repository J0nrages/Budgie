import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  accountSuggestionValidator,
  accountSubtypeValidator,
  accountTypeValidator,
  aiActionDecisionValidator,
  aiActionStatusValidator,
  aiActionSurfaceValidator,
  aiActionUndoStrategyValidator,
  importJobProgressStageValidator,
  budgetCadenceValidator,
  budgetTargetTypeValidator,
  importJobStatusValidator,
  importRowStatusValidator,
  interestMethodValidator,
  postingStatusValidator,
  reconciliationStatusValidator,
  refillBehaviorValidator,
  scenarioTypeValidator,
  statementRetentionPolicyValidator,
  statementStorageStatusValidator,
  statementFileStatusValidator,
  transactionTypeValidator,
  waterfallTierValidator,
} from "./validators";

export default defineSchema({
  accounts: defineTable({
    name: v.string(),
    type: accountTypeValidator,
    subtype: accountSubtypeValidator,
    issuer: v.optional(v.string()),
    institution: v.optional(v.string()),
    lastFour: v.optional(v.string()),
    initialBalanceCents: v.number(),
    creditLimitCents: v.optional(v.number()),
    aprBps: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    paymentDueDay: v.optional(v.number()),
    isDemo: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type_name", ["type", "name"])
    .index("by_issuer_lastFour", ["issuer", "lastFour"]),

  transactions: defineTable({
    type: transactionTypeValidator,
    amountCents: v.number(),
    accountId: v.optional(v.id("accounts")),
    fromAccountId: v.optional(v.id("accounts")),
    toAccountId: v.optional(v.id("accounts")),
    description: v.string(),
    category: v.optional(v.string()),
    /** Primary ledger sort date (defaults to bank posted date when accepted from import). */
    incurredDate: v.string(),
    /** Bank transaction / authorization date when distinct from posted. */
    transactionDate: v.optional(v.string()),
    /** Bank posted/settled date when distinct from incurredDate. */
    postedDate: v.optional(v.string()),
    merchantName: v.optional(v.string()),
    merchantId: v.optional(v.id("merchants")),
    originalDescription: v.optional(v.string()),
    memo: v.optional(v.string()),
    /** FITID or institution unique id when present. */
    bankTransactionId: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    checkNumber: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    /** Running balance cents from statement row when provided. */
    importedBalanceCents: v.optional(v.number()),
    postingStatus: v.optional(postingStatusValidator),
    /** Links pending row to eventual posted transaction (same key on both). */
    pendingMatchesKey: v.optional(v.string()),
    isCleared: v.boolean(),
    clearedDate: v.optional(v.string()),
    sourceImportRowId: v.optional(v.id("importRows")),
    sourceStatementFileId: v.optional(v.id("statementFiles")),
    duplicateKey: v.string(),
    isDemo: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_account_incurred", ["accountId", "incurredDate"])
    .index("by_from_incurred", ["fromAccountId", "incurredDate"])
    .index("by_to_incurred", ["toAccountId", "incurredDate"])
    .index("by_incurredDate", ["incurredDate"])
    .index("by_clearedDate", ["clearedDate"])
    .index("by_duplicateKey", ["duplicateKey"])
    .index("by_sourceImportRow", ["sourceImportRowId"])
    .index("by_sourceStatementFile", ["sourceStatementFileId"])
    .index("by_bank_transaction_id", ["bankTransactionId"])
    .index("by_account_posted", ["accountId", "postedDate"])
    .index("by_merchant_incurred", ["merchantName", "incurredDate"])
    .index("by_account_category_incurred", ["accountId", "category", "incurredDate"])
    .index("by_pending_matches_key", ["pendingMatchesKey"]),

  statementFiles: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    sha256: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    originalRetentionPolicy: statementRetentionPolicyValidator,
    originalStorageStatus: statementStorageStatusValidator,
    originalStorageDeletedAt: v.optional(v.number()),
    status: statementFileStatusValidator,
    redactedError: v.optional(v.string()),
    statementPeriodStart: v.optional(v.string()),
    statementPeriodEnd: v.optional(v.string()),
    openingBalanceCents: v.optional(v.number()),
    closingBalanceCents: v.optional(v.number()),
    balanceAsOfDate: v.optional(v.string()),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    provisionalReason: v.optional(v.string()),
    reconciliationDetail: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_sha256", ["sha256"])
    .index("by_account", ["accountId"])
    .index("by_status_account", ["status", "accountId"])
    .index("by_reconciliation_status", ["reconciliationStatus"]),

  importJobs: defineTable({
    statementFileId: v.id("statementFiles"),
    accountId: v.optional(v.id("accounts")),
    status: importJobStatusValidator,
    progressStage: v.optional(importJobProgressStageValidator),
    progressMessage: v.optional(v.string()),
    progressPercent: v.optional(v.number()),
    workflowId: v.optional(v.string()),
    parserId: v.optional(v.string()),
    accountSuggestion: v.optional(accountSuggestionValidator),
    parserWarnings: v.optional(v.array(v.string())),
    accountMetadataWarnings: v.optional(v.array(v.string())),
    rowCount: v.number(),
    acceptedCount: v.number(),
    rejectedCount: v.number(),
    duplicateCount: v.number(),
    redactedError: v.optional(v.string()),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    provisionalReason: v.optional(v.string()),
    reconciliationDetail: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_statementFile", ["statementFileId"])
    .index("by_account", ["accountId"]),

  importRows: defineTable({
    importJobId: v.id("importJobs"),
    statementFileId: v.id("statementFiles"),
    accountId: v.optional(v.id("accounts")),
    status: importRowStatusValidator,
    rowIndex: v.number(),
    rawSummary: v.string(),
    sourceReference: v.optional(v.string()),
    sourcePage: v.optional(v.number()),
    normalizedDescription: v.string(),
    originalDescription: v.optional(v.string()),
    memo: v.optional(v.string()),
    merchantName: v.optional(v.string()),
    normalizedMerchantName: v.optional(v.string()),
    suggestedMerchantName: v.optional(v.string()),
    normalizedCategory: v.optional(v.string()),
    normalizedIncurredDate: v.string(),
    normalizedTransactionDate: v.optional(v.string()),
    normalizedPostedDate: v.optional(v.string()),
    normalizedAmountCents: v.number(),
    normalizedType: transactionTypeValidator,
    bankTransactionId: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    checkNumber: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    importedBalanceCents: v.optional(v.number()),
    postingStatus: v.optional(postingStatusValidator),
    pendingMatchesKey: v.optional(v.string()),
    confidence: v.number(),
    duplicateKey: v.optional(v.string()),
    redactedError: v.optional(v.string()),
    acceptedTransactionId: v.optional(v.id("transactions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job_status", ["importJobId", "status"])
    .index("by_duplicateKey", ["duplicateKey"])
    .index("by_job_row", ["importJobId", "rowIndex"])
    .index("by_row_account", ["accountId"])
    .index("by_bank_transaction_id", ["bankTransactionId"])
    .index("by_job_merchant", ["importJobId", "merchantName"])
    .index("by_accepted_transaction", ["acceptedTransactionId"]),

  lenderProfiles: defineTable({
    accountId: v.id("accounts"),
    aprBps: v.optional(v.number()),
    gracePeriodDays: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    paymentDueDay: v.optional(v.number()),
    interestMethod: interestMethodValidator,
    isDemo: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_account", ["accountId"]),

  merchants: defineTable({
    canonicalName: v.string(),
    normalizedKey: v.string(),
    /** Hostname for Logo.dev domain lookup (e.g. wholefoodsmarket.com). */
    logoDomain: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalized_key", ["normalizedKey"])
    .index("by_canonical_name", ["canonicalName"]),

  merchantAliases: defineTable({
    merchantId: v.id("merchants"),
    /** Case-insensitive substring or normalized token matched against descriptions. */
    aliasPattern: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_merchant", ["merchantId"])
    .index("by_alias_pattern", ["aliasPattern"]),

  categoryGroups: defineTable({
    name: v.string(),
    waterfallTier: waterfallTierValidator,
    sortOrder: v.number(),
    icon: v.optional(v.string()),
    isSystem: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tier_sort", ["waterfallTier", "sortOrder"])
    .index("by_name", ["name"]),

  categories: defineTable({
    name: v.string(),
    groupId: v.id("categoryGroups"),
    normalizedKey: v.string(),
    icon: v.optional(v.string()),
    sortOrder: v.number(),
    isSystem: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group", ["groupId"])
    .index("by_normalized_key", ["normalizedKey"])
    .index("by_group_sort", ["groupId", "sortOrder"]),

  budgets: defineTable({
    name: v.string(),
    isActive: v.boolean(),
    monthlyIncomeCents: v.number(),
    effectiveFrom: v.string(),
    effectiveTo: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["isActive"])
    .index("by_effectiveFrom", ["effectiveFrom"]),

  budgetLineItems: defineTable({
    budgetId: v.id("budgets"),
    categoryId: v.optional(v.id("categories")),
    categoryGroupId: v.optional(v.id("categoryGroups")),
    targetType: budgetTargetTypeValidator,
    limitCents: v.number(),
    cadence: budgetCadenceValidator,
    cadenceDayOfWeek: v.optional(v.number()),
    cadenceDayOfMonth: v.optional(v.number()),
    targetDate: v.optional(v.string()),
    refillBehavior: refillBehaviorValidator,
    rolloverUnused: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_budget", ["budgetId"])
    .index("by_budget_category", ["budgetId", "categoryId"])
    .index("by_budget_group", ["budgetId", "categoryGroupId"])
    .index("by_budget_sort", ["budgetId", "sortOrder"])
    .index("by_line_category", ["categoryId"])
    .index("by_line_group", ["categoryGroupId"]),

  budgetScenarios: defineTable({
    name: v.string(),
    baseBudgetId: v.id("budgets"),
    scenarioType: scenarioTypeValidator,
    lineItemOverrides: v.array(
      v.object({
        lineItemId: v.id("budgetLineItems"),
        limitCents: v.number(),
      }),
    ),
    incomeOverrideCents: v.optional(v.number()),
    additionalExpensesCents: v.optional(v.number()),
    removedExpensesCents: v.optional(v.number()),
    monthsToProject: v.number(),
    startMonth: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_baseBudget", ["baseBudgetId"]),

  /**
   * Audit trail for every AI-initiated tool call, whether read or write.
   * Read tools log a single `auto` + `success` row for observability.
   * Write tools log a `pendingDecision` row when proposed, then update with
   * the human decision and outcome. `undoDataJson` captures the prior state
   * needed for `undoAiAction` to reverse the change.
   */
  aiActions: defineTable({
    surface: aiActionSurfaceValidator,
    sessionId: v.optional(v.string()),
    toolName: v.string(),
    argsJson: v.string(),
    proposalSummary: v.string(),
    decision: aiActionDecisionValidator,
    decisionAt: v.number(),
    status: aiActionStatusValidator,
    resultJson: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    undoStrategy: v.optional(aiActionUndoStrategyValidator),
    undoDataJson: v.optional(v.string()),
    undoneAt: v.optional(v.number()),
    requiresApproval: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_decisionAt", ["decisionAt"])
    .index("by_surface_decisionAt", ["surface", "decisionAt"])
    .index("by_session", ["sessionId"])
    .index("by_status_decisionAt", ["status", "decisionAt"])
    .index("by_toolName_decisionAt", ["toolName", "decisionAt"]),
});
