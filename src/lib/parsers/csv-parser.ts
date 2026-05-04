import type { ParserInput, ParserResult, ParserRow } from "./parser-types";

function parseMoneyCell(raw: string): number | null {
  const s = raw.trim().replace(/[$,]/g, "");
  if (s.length === 0) return null;
  const negative = s.startsWith("(") && s.endsWith(")");
  const n = Number.parseFloat(negative ? s.slice(1, -1) : s);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Flexible CSV: expects headers containing date + amount OR debit/credit + description/mem/payee.
 * Optionally reads separate transaction vs post dates, balance, FITID, memo, merchant.
 */
export function parseBankCsv(input: ParserInput): ParserResult {
  const text = input.text;
  if (!text || text.trim().length === 0) {
    return {
      ok: false,
      errorCode: "EMPTY_FILE",
      message: "Statement file is empty.",
    };
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      ok: false,
      errorCode: "MISSING_ROWS",
      message: "CSV must include a header row and at least one data row.",
    };
  }

  const headers = lines[0].split(",").map((c) => normalizeHeader(c));
  const idx = (name: string): number =>
    headers.findIndex((h) => h.includes(name));

  const postDateIdx = ["postingdate", "postdate", "settlementdate"].map(idx).find((i) => i >= 0);
  const txnDateIdx = ["transactiondate", "transdate", "activitydate"].map(idx).find((i) => i >= 0);
  const legacyDateIdx = ["date", "details"].map(idx).find((i) => i >= 0);

  const primaryDateIdx = postDateIdx ?? txnDateIdx ?? legacyDateIdx;

  const amountIdx = idx("amount");
  const debitIdx = idx("debit");
  const creditIdx = idx("credit");
  const balanceIdx = ["balance", "runningbalance"].map(idx).find((i) => i >= 0);
  const memoIdx = idx("memo");
  const merchantIdx = ["merchant", "payee"].map(idx).find((i) => i >= 0);
  const descIdx = ["description", "details", "name"].map(idx).find((i) => i >= 0);
  const fitIdx = ["fitid", "transactionid", "reference"].map(idx).find((i) => i >= 0);
  const checkIdx = idx("checknumber");
  const typeIdx = idx("type");

  if (primaryDateIdx === undefined || (descIdx === undefined && merchantIdx === undefined)) {
    return {
      ok: false,
      errorCode: "MISSING_COLUMNS",
      message:
        "CSV is missing required columns (need a date column and description or merchant).",
    };
  }

  if (amountIdx < 0 && (debitIdx < 0 || creditIdx < 0)) {
    return {
      ok: false,
      errorCode: "MISSING_AMOUNT",
      message:
        "CSV must include an Amount column or separate Debit and Credit columns.",
    };
  }

  const rows: ParserRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const postedRaw =
      postDateIdx !== undefined ? (cells[postDateIdx]?.trim() ?? "") : "";
    const txnRaw =
      txnDateIdx !== undefined && txnDateIdx !== postDateIdx
        ? (cells[txnDateIdx]?.trim() ?? "")
        : "";
    const legacyRaw = cells[primaryDateIdx]?.trim() ?? "";
    const dateRaw =
      postedRaw.length > 0 ? postedRaw : txnRaw.length > 0 ? txnRaw : legacyRaw;

    const descRaw =
      descIdx !== undefined ? (cells[descIdx]?.trim() ?? "") : "";
    const merchantRaw =
      merchantIdx !== undefined ? (cells[merchantIdx]?.trim() ?? "") : "";
    const memoRaw = memoIdx !== undefined ? (cells[memoIdx]?.trim() ?? "") : "";

    let amountCents: number | undefined;
    if (amountIdx >= 0) {
      const parsed = parseMoneyCell(cells[amountIdx] ?? "");
      amountCents = parsed ?? undefined;
    } else {
      const debit =
        debitIdx >= 0 ? parseMoneyCell(cells[debitIdx] ?? "") : null;
      const credit =
        creditIdx >= 0 ? parseMoneyCell(cells[creditIdx] ?? "") : null;
      const d = debit && debit !== 0 ? Math.abs(debit) : 0;
      const c = credit && credit !== 0 ? Math.abs(credit) : 0;
      if (d && c) {
        rows.push({
          rowIndex: i - 1,
          rawSummary: `Row ${i}: conflicting debit and credit`,
          description: descRaw || merchantRaw,
          postedDate: dateRaw,
        });
        continue;
      }
      if (d) amountCents = -d;
      else if (c) amountCents = c;
    }

    let balanceCents: number | undefined;
    if (balanceIdx !== undefined) {
      const b = parseMoneyCell(cells[balanceIdx] ?? "");
      if (b !== null) balanceCents = b;
    }

    const bankRaw = fitIdx !== undefined ? (cells[fitIdx]?.trim() ?? "") : "";
    const checkRaw = checkIdx >= 0 ? (cells[checkIdx]?.trim() ?? "") : "";
    const typeRaw = typeIdx >= 0 ? (cells[typeIdx]?.trim().toLowerCase() ?? "") : "";

    let postingStatus: ParserRow["postingStatus"];
    if (typeRaw.includes("pending")) postingStatus = "pending";
    else if (typeRaw.includes("posted") || typeRaw.includes("complete")) {
      postingStatus = "posted";
    }

    const description = descRaw.length > 0 ? descRaw : merchantRaw;
    const merchantName = merchantRaw.length > 0 && merchantRaw !== descRaw ? merchantRaw : undefined;

    rows.push({
      rowIndex: i - 1,
      rawSummary: `Row ${i}: ${dateRaw} · ${description.slice(0, 80)}`,
      postedDate: postedRaw.length > 0 ? postedRaw : dateRaw,
      transactionDate:
        txnRaw.length > 0 && txnRaw !== postedRaw ? txnRaw : undefined,
      description,
      merchantName,
      memo: memoRaw.length > 0 ? memoRaw : undefined,
      amountCents,
      balanceCents,
      bankTransactionId: bankRaw.length > 0 ? bankRaw : undefined,
      checkNumber: checkRaw.length > 0 ? checkRaw : undefined,
      postingStatus,
    });
  }

  return { ok: true, rows, warnings: [] };
}
