/** Shared finance types — no React / Convex imports. */

export type AccountType = "asset" | "liability";

export type AccountSubtype =
  | "checking"
  | "savings"
  | "creditCard"
  | "loan"
  | "cash"
  | "other";

export type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "interest"
  | "fee"
  | "payment";

export type StatementFileStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "parsed"
  | "failed";

export type ImportJobStatus =
  | "queued"
  | "processing"
  | "needsAccountLink"
  | "needsReview"
  | "accepted"
  | "failed"
  | "cancelled";

export type ImportRowStatus =
  | "needsReview"
  | "accepted"
  | "rejected"
  | "duplicate"
  | "error";

export type Basis = "cash" | "accrual";

export type InterestMethod =
  | "averageDailyBalance"
  | "dailyBalance"
  | "statementBalanceEstimate";

/** Bank-reported posting lifecycle. */
export type PostingStatus = "pending" | "posted";

/** Statement reconciliation vs source balances. */
export type ReconciliationStatus =
  | "unknown"
  | "provisional"
  | "matched"
  | "mismatch";
