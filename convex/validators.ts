import { v } from "convex/values";

export const accountTypeValidator = v.union(
  v.literal("asset"),
  v.literal("liability"),
);

export const accountSubtypeValidator = v.union(
  v.literal("checking"),
  v.literal("savings"),
  v.literal("creditCard"),
  v.literal("loan"),
  v.literal("cash"),
  v.literal("other"),
);

export const transactionTypeValidator = v.union(
  v.literal("income"),
  v.literal("expense"),
  v.literal("transfer"),
  v.literal("interest"),
  v.literal("fee"),
  v.literal("payment"),
);

export const statementFileStatusValidator = v.union(
  v.literal("uploaded"),
  v.literal("queued"),
  v.literal("processing"),
  v.literal("parsed"),
  v.literal("failed"),
);

export const statementRetentionPolicyValidator = v.union(v.literal("keep"));

export const statementStorageStatusValidator = v.union(
  v.literal("available"),
  v.literal("deleted"),
);

export const importJobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("needsAccountLink"),
  v.literal("needsReview"),
  v.literal("accepted"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const importJobProgressStageValidator = v.union(
  v.literal("queued"),
  v.literal("starting"),
  v.literal("loadingFile"),
  v.literal("verifyingHash"),
  v.literal("firecrawlParse"),
  v.literal("choosingParser"),
  v.literal("normalizingRows"),
  v.literal("persistingRows"),
  v.literal("ready"),
  v.literal("failed"),
);

export const importRowStatusValidator = v.union(
  v.literal("needsReview"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("duplicate"),
  v.literal("error"),
);

/** Bank-reported posting lifecycle for a row or transaction. */
export const postingStatusValidator = v.union(
  v.literal("pending"),
  v.literal("posted"),
);

/** Statement / import job reconciliation against source balances. */
export const reconciliationStatusValidator = v.union(
  v.literal("unknown"),
  v.literal("provisional"),
  v.literal("matched"),
  v.literal("mismatch"),
);

export const interestMethodValidator = v.union(
  v.literal("averageDailyBalance"),
  v.literal("dailyBalance"),
  v.literal("statementBalanceEstimate"),
);

export const isoDateValidator = v.string();

export const positiveCentsValidator = v.number();

export const confidenceValidator = v.number();

export const accountSuggestionValidator = v.object({
  issuer: v.string(),
  lastFour: v.string(),
  institution: v.optional(v.string()),
  creditLimitCents: v.optional(v.number()),
  statementDay: v.optional(v.number()),
  paymentDueDay: v.optional(v.number()),
  aprBps: v.optional(v.number()),
  statementPeriodStart: v.optional(v.string()),
  statementPeriodEnd: v.optional(v.string()),
});

/**
 * Shape of a parsed statement row produced by `parseStatementForImportJob`
 * and consumed by `persistParseResults`. Defined here so files in either
 * Convex runtime (V8 or Node) can import it without triggering cross-runtime
 * bundling of query/mutation handlers.
 */
export const normalizedRowValidator = v.object({
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
  rowError: v.optional(v.string()),
});

/** Category group waterfall tier (Rocket Money-style sections). */
export const waterfallTierValidator = v.union(
  v.literal("income"),
  v.literal("fixed"),
  v.literal("flexible"),
  v.literal("savings"),
);

/** Budget line target type (YNAB-style). */
export const budgetTargetTypeValidator = v.union(
  v.literal("spending"),
  v.literal("savingsBalance"),
  v.literal("monthlyBuilder"),
);

export const budgetCadenceValidator = v.union(
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("yearly"),
  v.literal("byDate"),
);

export const refillBehaviorValidator = v.union(
  v.literal("setAside"),
  v.literal("refillUpTo"),
);

/** Pace vs linear spend-through-the-month expectation. */
export const paceStatusValidator = v.union(
  v.literal("underPace"),
  v.literal("nearPace"),
  v.literal("overPace"),
  v.literal("overBudget"),
);

export const scenarioTypeValidator = v.union(
  v.literal("budgetTweak"),
  v.literal("lifeChange"),
);

/** Surface that originated an AI-driven action (in-app chat vs. external MCP client). */
export const aiActionSurfaceValidator = v.union(
  v.literal("inAppChat"),
  v.literal("mcp"),
);

/** Human (or auto) decision on a proposed AI action. */
export const aiActionDecisionValidator = v.union(
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("auto"),
);

/** Execution status after a decision has been recorded. */
export const aiActionStatusValidator = v.union(
  v.literal("pendingDecision"),
  v.literal("success"),
  v.literal("error"),
  v.literal("rejected"),
  v.literal("undone"),
);

/**
 * Strategy used by `undoAiAction` to revert a previously-applied write.
 * Stored per-row so each tool can decide how its undo data should be interpreted.
 */
export const aiActionUndoStrategyValidator = v.union(
  v.literal("restoreTransactionSnapshots"),
  v.literal("deleteBudgetCascade"),
  v.literal("revertBudgetLineItemLimit"),
  v.literal("reverseMerchantMerge"),
);
