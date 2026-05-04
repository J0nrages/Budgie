import { detectIssuer } from "./issuer-detect";
import type { ParserInput, ParserResult, ParserRow } from "./parser-types";

type DiscoverSection = "payments" | "purchases" | "fees" | "interest" | null;

type ParsedRow = {
  transactionDate?: string;
  postedDate: string;
  description: string;
  amountCents: number;
  category?: string;
};

function cleanLine(line: string): string {
  return line
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmountCents(raw: string): number | null {
  const normalized = raw.replace(/[$,\s]/g, "");
  if (!normalized) return null;

  const negative =
    normalized.startsWith("-") ||
    (normalized.startsWith("(") && normalized.endsWith(")"));
  const numeric = negative
    ? normalized.replace(/[()-]/g, "")
    : normalized.replace(/^\+/, "");
  const parsed = Number.parseFloat(numeric);
  if (!Number.isFinite(parsed)) return null;

  const cents = Math.round(parsed * 100);
  return negative ? -Math.abs(cents) : Math.abs(cents);
}

function inferSection(line: string): DiscoverSection {
  const lower = line.toLowerCase();
  if (
    lower.includes("payments and credits") ||
    lower.includes("payments & credits")
  ) {
    return "payments";
  }
  if (lower === "purchases" || lower.includes("purchase transactions")) {
    return "purchases";
  }
  if (lower.includes("fees charged") || lower === "fees") return "fees";
  if (lower.includes("interest charged") || lower === "interest") {
    return "interest";
  }
  return null;
}

function sectionToCategory(section: DiscoverSection): string | undefined {
  switch (section) {
    case "payments":
      return "Payments and credits";
    case "fees":
      return "Fees";
    case "interest":
      return "Interest";
    case "purchases":
      return "Purchases";
    default:
      return undefined;
  }
}

function signAmount(
  amountCents: number,
  section: DiscoverSection,
  description: string,
): number {
  if (amountCents < 0) return amountCents;
  if (section === "payments") return -Math.abs(amountCents);
  if (section === "fees" || section === "interest" || section === "purchases") {
    return Math.abs(amountCents);
  }

  if (/payment|credit|autopay|cashback|reward/i.test(description)) {
    return -Math.abs(amountCents);
  }
  return Math.abs(amountCents);
}

function parseMdSlashDate(value: string): { month: number; day: number } | null {
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function inferYearForMonthDay(
  month: number,
  day: number,
  statementPeriodStart: string | undefined,
  statementPeriodEnd: string | undefined,
): number {
  const fallbackYear = new Date().getUTCFullYear();
  if (!statementPeriodEnd) return fallbackYear;

  const endYear = Number(statementPeriodEnd.slice(0, 4));
  if (!statementPeriodStart) return endYear;

  const startYear = Number(statementPeriodStart.slice(0, 4));
  const endMonth = Number(statementPeriodEnd.slice(5, 7));
  const endDay = Number(statementPeriodEnd.slice(8, 10));

  if (startYear === endYear) return endYear;
  if (month > endMonth || (month === endMonth && day > endDay)) return startYear;
  return endYear;
}

function toIsoDate(
  raw: string,
  statementPeriodStart: string | undefined,
  statementPeriodEnd: string | undefined,
): string | null {
  const parsed = parseMdSlashDate(raw);
  if (!parsed) return null;
  const year = inferYearForMonthDay(
    parsed.month,
    parsed.day,
    statementPeriodStart,
    statementPeriodEnd,
  );
  return `${year.toString().padStart(4, "0")}-${parsed.month
    .toString()
    .padStart(2, "0")}-${parsed.day.toString().padStart(2, "0")}`;
}

function parseTableRow(
  line: string,
  section: DiscoverSection,
  statementPeriodStart: string | undefined,
  statementPeriodEnd: string | undefined,
): ParsedRow | null {
  if (!line.includes("|")) return null;
  const cells = line
    .split("|")
    .map((cell) => cleanLine(cell))
    .filter((cell) => cell.length > 0);
  if (cells.length < 4) return null;
  if (
    cells.every((cell) => /^:?-{2,}:?$/.test(cell)) ||
    /^trans/i.test(cells[0]) ||
    /^post/i.test(cells[1])
  ) {
    return null;
  }

  const postDate = toIsoDate(cells[1], statementPeriodStart, statementPeriodEnd);
  const transDateIso = toIsoDate(cells[0], statementPeriodStart, statementPeriodEnd);
  const amountCents = parseAmountCents(cells[cells.length - 1]);
  const description = cells.slice(2, -1).join(" ").trim();
  if (!postDate || amountCents === null || !description) return null;

  return {
    transactionDate:
      transDateIso && transDateIso !== postDate ? transDateIso : undefined,
    postedDate: postDate,
    description,
    amountCents: signAmount(amountCents, section, description),
    category: sectionToCategory(section),
  };
}

function parseStatementLine(
  line: string,
  section: DiscoverSection,
  statementPeriodStart: string | undefined,
  statementPeriodEnd: string | undefined,
): ParsedRow | null {
  const match =
    /^(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?\s+(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?\s+(.+?)\s+([-$(]?\$?[\d,]+\.\d{2}\)?)/.exec(
      line,
    ) ??
    /^(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?\s+(.+?)\s+([-$(]?\$?[\d,]+\.\d{2}\)?)/.exec(
      line,
    );
  if (!match) return null;

  const postDateRaw = match.length >= 5 ? match[2] : match[1];
  const transDateRaw = match.length >= 5 ? match[1] : undefined;
  const description = cleanLine(match.length >= 5 ? match[3] : match[2]);
  const amountRaw = match[match.length - 1];
  const postedDate = toIsoDate(
    postDateRaw,
    statementPeriodStart,
    statementPeriodEnd,
  );
  const transactionDate = transDateRaw
    ? toIsoDate(transDateRaw, statementPeriodStart, statementPeriodEnd)
    : undefined;
  const amountCents = parseAmountCents(amountRaw);
  if (!postedDate || amountCents === null || !description) return null;

  return {
    transactionDate:
      transactionDate && transactionDate !== postedDate
        ? transactionDate
        : undefined,
    postedDate,
    description,
    amountCents: signAmount(amountCents, section, description),
    category: sectionToCategory(section),
  };
}

function shouldTreatAsContinuation(line: string): boolean {
  if (!line) return false;
  if (/^(page \d+|continued|total|new balance|credit line|account number)/i.test(line)) {
    return false;
  }
  if (/^\d{1,2}\/\d{1,2}/.test(line)) return false;
  if (inferSection(line)) return false;
  return true;
}

export function parseDiscoverStatement(input: ParserInput): ParserResult {
  const source = input.markdown ?? input.text;
  if (!source || source.trim().length === 0) {
    return {
      ok: false,
      errorCode: "EMPTY_FILE",
      message: "PDF text extraction produced no readable statement content.",
    };
  }

  const detection = detectIssuer(input);
  const statementPeriodStart = detection.accountSuggestion?.statementPeriodStart;
  const statementPeriodEnd = detection.accountSuggestion?.statementPeriodEnd;

  const lines = source
    .split(/\n+/)
    .map((line) => cleanLine(line))
    .filter((line) => line.length > 0);

  const rows: ParserRow[] = [];
  let section: DiscoverSection = null;

  for (const line of lines) {
    section = inferSection(line) ?? section;

    const parsed =
      parseTableRow(line, section, statementPeriodStart, statementPeriodEnd) ??
      parseStatementLine(line, section, statementPeriodStart, statementPeriodEnd);

    if (parsed) {
      rows.push({
        rowIndex: rows.length,
        rawSummary: `${parsed.postedDate} · ${parsed.description.slice(0, 80)}`,
        postedDate: parsed.postedDate,
        transactionDate: parsed.transactionDate,
        description: parsed.description,
        amountCents: parsed.amountCents,
        category: parsed.category,
        postingStatus: "posted",
      });
      continue;
    }

    const previous = rows[rows.length - 1];
    if (previous && shouldTreatAsContinuation(line)) {
      previous.description = `${previous.description ?? ""} ${line}`.trim();
      previous.rawSummary = `${previous.postedDate ?? "unknown"} · ${(previous.description ?? "").slice(0, 80)}`;
    }
  }

  if (rows.length === 0) {
    return {
      ok: false,
      errorCode: "DISCOVER_ROWS_NOT_FOUND",
      message:
        "Could not locate Discover statement transactions in the extracted PDF text.",
    };
  }

  return {
    ok: true,
    rows,
    warnings: [],
    accountSuggestion: detection.accountSuggestion,
  };
}
