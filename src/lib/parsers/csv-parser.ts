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

  const dateIdx = ["date", "posted", "transactiondate"].map(idx).find((i) => i >= 0);
  const amountIdx = idx("amount");
  const debitIdx = idx("debit");
  const creditIdx = idx("credit");
  const descIdx = ["description", "memo", "payee", "details", "name"]
    .map(idx)
    .find((i) => i >= 0);

  if (dateIdx === undefined || descIdx === undefined) {
    return {
      ok: false,
      errorCode: "MISSING_COLUMNS",
      message:
        "CSV is missing required columns (need date and description fields).",
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
    const dateRaw = cells[dateIdx]?.trim() ?? "";
    const descRaw = cells[descIdx]?.trim() ?? "";

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
          description: descRaw,
          postedDate: dateRaw,
        });
        continue;
      }
      if (d) amountCents = -d;
      else if (c) amountCents = c;
    }

    rows.push({
      rowIndex: i - 1,
      rawSummary: `Row ${i}: ${dateRaw} · ${descRaw.slice(0, 80)}`,
      postedDate: dateRaw,
      description: descRaw,
      amountCents,
    });
  }

  return { ok: true, rows, warnings: [] };
}
