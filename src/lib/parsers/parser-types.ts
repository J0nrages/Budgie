import type { PostingStatus, TransactionType } from "../../types/finance";

export type AccountSuggestion = {
  issuer: string;
  lastFour: string;
  institution?: string;
  creditLimitCents?: number;
  statementDay?: number;
  paymentDueDay?: number;
  aprBps?: number;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
};

/** Raw row produced by a bank-specific parser before normalization. */
export type ParserRow = {
  rowIndex: number;
  /** Short safe summary for reviewers — never full raw CSV line with PII. */
  rawSummary: string;
  /** Primary date used for sorting when only one column exists (often posted). */
  postedDate?: string;
  /** Distinct transaction / authorization date when the source provides it. */
  transactionDate?: string;
  description?: string;
  /** Original payee line before cleanup (when separate from description). */
  merchantName?: string;
  memo?: string;
  amountCents?: number;
  debitCents?: number;
  creditCents?: number;
  category?: string;
  /** Running balance after row when present in export. */
  balanceCents?: number;
  bankTransactionId?: string;
  referenceNumber?: string;
  checkNumber?: string;
  currencyCode?: string;
  postingStatus?: PostingStatus;
};

export type ParserWarning = {
  code: string;
  message: string;
};

export type ParserSuccess = {
  ok: true;
  rows: ParserRow[];
  warnings: ParserWarning[];
  accountSuggestion?: AccountSuggestion;
};

export type ParserFailure = {
  ok: false;
  errorCode: string;
  /** Safe user-facing message — no statement text. */
  message: string;
};

export type ParserResult = ParserSuccess | ParserFailure;

export type ParserInput = {
  fileName: string;
  contentType: string;
  /** UTF-8 text for CSV-like parsers */
  text?: string;
  /** Markdown from OCR / layout-aware parsers such as Firecrawl */
  markdown?: string;
  /** Raw bytes length (for guards) */
  sizeBytes: number;
};

export type NormalizedImportCandidate = {
  rowIndex: number;
  rawSummary: string;
  sourceReference?: string;
  sourcePage?: number;
  normalizedDescription: string;
  originalDescription?: string;
  memo?: string;
  merchantName?: string;
  normalizedMerchantName?: string;
  suggestedMerchantName?: string;
  normalizedCategory?: string;
  normalizedIncurredDate: string;
  normalizedTransactionDate?: string;
  normalizedPostedDate?: string;
  normalizedAmountCents: number;
  normalizedType: TransactionType;
  bankTransactionId?: string;
  referenceNumber?: string;
  checkNumber?: string;
  currencyCode?: string;
  importedBalanceCents?: number;
  postingStatus?: PostingStatus;
  pendingMatchesKey?: string;
  confidence: number;
  rowError?: string;
};
