import type { NormalizedImportCandidate, ParserRow } from "./parsers/parser-types";
import type { TransactionType } from "../types/finance";
import { parseFlexibleDate } from "./dates";

function inferType(signedCents: number): TransactionType {
  return signedCents < 0 ? "income" : "expense";
}

/**
 * Map parser output into review-ready candidates. Row-level problems become
 * `rowError` instead of throwing (valid rows still surface).
 */
export function normalizeParserRows(rows: ParserRow[]): NormalizedImportCandidate[] {
  const out: NormalizedImportCandidate[] = [];

  for (const row of rows) {
    const desc = (row.description ?? "").trim();
    const dateRaw = (row.postedDate ?? "").trim();

    if (!dateRaw) {
      out.push({
        rowIndex: row.rowIndex,
        rawSummary: row.rawSummary,
        normalizedDescription: desc || "(no description)",
        normalizedIncurredDate: "1970-01-01",
        normalizedAmountCents: 0,
        normalizedType: "expense",
        confidence: 0,
        rowError: "Missing date",
      });
      continue;
    }

    const incurred = parseFlexibleDate(dateRaw);
    if (!incurred) {
      out.push({
        rowIndex: row.rowIndex,
        rawSummary: row.rawSummary,
        normalizedDescription: desc || "(no description)",
        normalizedIncurredDate: "1970-01-01",
        normalizedAmountCents: 0,
        normalizedType: "expense",
        confidence: 0,
        rowError: "Unrecognized date format",
      });
      continue;
    }

    const signed =
      row.amountCents ??
      (row.debitCents || row.creditCents
        ? (row.creditCents ?? 0) - (row.debitCents ?? 0)
        : undefined);

    if (signed === undefined || !Number.isFinite(signed) || signed === 0) {
      out.push({
        rowIndex: row.rowIndex,
        rawSummary: row.rawSummary,
        normalizedDescription: desc || "(no description)",
        normalizedIncurredDate: incurred,
        normalizedAmountCents: 0,
        normalizedType: "expense",
        confidence: 0.2,
        rowError: "Missing or zero amount",
      });
      continue;
    }

    const type: TransactionType = inferType(signed);
    const normalizedAmountCents = Math.abs(signed);

    const cat = row.category?.trim();
    out.push({
      rowIndex: row.rowIndex,
      rawSummary: row.rawSummary,
      normalizedDescription: desc || "(no description)",
      normalizedCategory: cat && cat.length > 0 ? cat : undefined,
      normalizedIncurredDate: incurred,
      normalizedAmountCents,
      normalizedType: type,
      confidence: 0.85,
    });
  }

  return out;
}
