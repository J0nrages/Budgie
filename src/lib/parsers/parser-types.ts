import type { TransactionType } from "../../types/finance";

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
  postedDate?: string;
  description?: string;
  amountCents?: number;
  debitCents?: number;
  creditCents?: number;
  category?: string;
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
  normalizedDescription: string;
  normalizedCategory?: string;
  normalizedIncurredDate: string;
  normalizedAmountCents: number;
  normalizedType: TransactionType;
  confidence: number;
  rowError?: string;
};
