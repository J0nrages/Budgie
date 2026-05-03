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

export const importJobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("needsAccountLink"),
  v.literal("needsReview"),
  v.literal("accepted"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const importRowStatusValidator = v.union(
  v.literal("needsReview"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("duplicate"),
  v.literal("error"),
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
