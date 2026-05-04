import type { NormalizedImportCandidate, ParserRow } from "./parsers/parser-types";
import type { TransactionType } from "../types/finance";
import { parseFlexibleDate } from "./dates";
import { normalizedMerchantKey } from "./merchant-normalize";

function inferType(signedCents: number): TransactionType {
  return signedCents < 0 ? "income" : "expense";
}

function buildPendingMatchesKey(
  bankTransactionId: string | undefined,
  referenceNumber: string | undefined,
): string | undefined {
  const bank = bankTransactionId?.trim();
  if (bank && bank.length > 0) return `bank:${bank}`;
  const ref = referenceNumber?.trim();
  if (ref && ref.length > 0) return `ref:${ref}`;
  return undefined;
}

/**
 * Map parser output into review-ready candidates. Row-level problems become
 * `rowError` instead of throwing (valid rows still surface).
 */
export function normalizeParserRows(rows: ParserRow[]): NormalizedImportCandidate[] {
  const out: NormalizedImportCandidate[] = [];

  for (const row of rows) {
    const desc = (row.description ?? "").trim();
    const postedRaw = (row.postedDate ?? "").trim();
    const txnRaw = (row.transactionDate ?? "").trim();
    const primaryRaw = postedRaw.length > 0 ? postedRaw : txnRaw;

    if (!primaryRaw) {
      out.push({
        rowIndex: row.rowIndex,
        rawSummary: row.rawSummary,
        normalizedDescription: desc || "(no description)",
        originalDescription: desc || undefined,
        normalizedIncurredDate: "1970-01-01",
        normalizedAmountCents: 0,
        normalizedType: "expense",
        confidence: 0,
        rowError: "Missing date",
      });
      continue;
    }

    const incurred = parseFlexibleDate(primaryRaw);
    if (!incurred) {
      out.push({
        rowIndex: row.rowIndex,
        rawSummary: row.rawSummary,
        normalizedDescription: desc || "(no description)",
        originalDescription: desc || undefined,
        normalizedIncurredDate: "1970-01-01",
        normalizedAmountCents: 0,
        normalizedType: "expense",
        confidence: 0,
        rowError: "Unrecognized date format",
      });
      continue;
    }

    let normalizedPostedDate: string | undefined;
    if (postedRaw.length > 0) {
      const p = parseFlexibleDate(postedRaw);
      if (p) normalizedPostedDate = p;
    }
    let normalizedTransactionDate: string | undefined;
    if (txnRaw.length > 0 && txnRaw !== postedRaw) {
      const t = parseFlexibleDate(txnRaw);
      if (t) normalizedTransactionDate = t;
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
        originalDescription: desc || undefined,
        memo: row.memo?.trim() || undefined,
        merchantName: row.merchantName?.trim() || undefined,
        normalizedCategory: row.category?.trim() || undefined,
        normalizedIncurredDate: incurred,
        normalizedPostedDate,
        normalizedTransactionDate,
        normalizedAmountCents: 0,
        normalizedType: "expense",
        currencyCode: row.currencyCode?.trim().toUpperCase() || undefined,
        importedBalanceCents: row.balanceCents,
        bankTransactionId: row.bankTransactionId?.trim() || undefined,
        referenceNumber: row.referenceNumber?.trim() || undefined,
        checkNumber: row.checkNumber?.trim() || undefined,
        postingStatus: row.postingStatus,
        confidence: 0.2,
        rowError: "Missing or zero amount",
      });
      continue;
    }

    const type: TransactionType = inferType(signed);
    const normalizedAmountCents = Math.abs(signed);

    const cat = row.category?.trim();
    const merchantRaw = (row.merchantName ?? "").trim();
    const merchantName = merchantRaw.length > 0 ? merchantRaw : undefined;
    const normalizedMerchantName = merchantName
      ? normalizedMerchantKey(merchantName)
      : desc
        ? normalizedMerchantKey(desc)
        : undefined;

    const pendingMatchesKey = buildPendingMatchesKey(
      row.bankTransactionId,
      row.referenceNumber,
    );

    out.push({
      rowIndex: row.rowIndex,
      rawSummary: row.rawSummary,
      normalizedDescription: desc || "(no description)",
      originalDescription: desc || undefined,
      memo: row.memo?.trim() || undefined,
      merchantName,
      normalizedMerchantName,
      normalizedCategory: cat && cat.length > 0 ? cat : undefined,
      normalizedIncurredDate: incurred,
      normalizedPostedDate,
      normalizedTransactionDate,
      normalizedAmountCents,
      normalizedType: type,
      bankTransactionId: row.bankTransactionId?.trim() || undefined,
      referenceNumber: row.referenceNumber?.trim() || undefined,
      checkNumber: row.checkNumber?.trim() || undefined,
      currencyCode: row.currencyCode?.trim().toUpperCase() || undefined,
      importedBalanceCents: row.balanceCents,
      postingStatus: row.postingStatus,
      pendingMatchesKey,
      confidence: 0.85,
    });
  }

  return out;
}
