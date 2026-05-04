import { isIsoDate, parseFlexibleDate } from "../dates";
import { parseUsdToCents } from "../money";
import type { AccountSuggestion, ParserInput } from "./parser-types";

export type SupportedIssuer = "discover" | "chase" | "americanExpress";

export type IssuerDetection = {
  issuer?: SupportedIssuer;
  issuerName?: string;
  accountSuggestion?: AccountSuggestion;
};

const issuerPatterns: Array<{
  issuer: SupportedIssuer;
  issuerName: string;
  patterns: RegExp[];
}> = [
  {
    issuer: "discover",
    issuerName: "Discover",
    patterns: [/\bdiscover\b/i, /\bdiscovercard\b/i],
  },
  {
    issuer: "chase",
    issuerName: "Chase",
    patterns: [/\bchase\b/i, /\bjpmorgan chase\b/i],
  },
  {
    issuer: "americanExpress",
    issuerName: "American Express",
    patterns: [/\bamerican express\b/i, /\bamex\b/i],
  },
];

const STATEMENT_DATE_PATTERN =
  "(?:\\d{1,2}/\\d{1,2}/\\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s+\\d{1,2},?\\s+\\d{2,4})";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function compactWhitespace(value: string): string {
  return value.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function parseStatementDate(value: string): string | null {
  const direct = parseFlexibleDate(value);
  if (direct) return direct;

  const monthName =
    /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(value.trim());
  if (monthName) {
    const month = MONTHS[monthName[1].toLowerCase()];
    const day = Number(monthName[2]);
    const rawYear = Number(monthName[3]);
    const year = rawYear < 100 ? (rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
    if (month) {
      const iso = `${year.toString().padStart(4, "0")}-${month
        .toString()
        .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      return isIsoDate(iso) ? iso : null;
    }
  }

  const shortYear = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(value.trim());
  if (!shortYear) return null;

  const month = Number(shortYear[1]);
  const day = Number(shortYear[2]);
  const year = Number(shortYear[3]);
  const fullYear = year >= 70 ? 1900 + year : 2000 + year;
  const iso = `${fullYear.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

  return isIsoDate(iso) ? iso : null;
}

function getDayOfMonth(isoDate: string | undefined): number | undefined {
  if (!isoDate) return undefined;
  return Number(isoDate.slice(-2));
}

function matchIssuer(text: string): {
  issuer: SupportedIssuer;
  issuerName: string;
} | null {
  for (const entry of issuerPatterns) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return {
        issuer: entry.issuer,
        issuerName: entry.issuerName,
      };
    }
  }

  return null;
}

function extractLastFour(text: string): string | undefined {
  const patterns = [
    /account(?: number)?(?: ending)?(?: in)?[^\d]*(\d{4})\b/i,
    /ending in[^\d]*(\d{4})\b/i,
    /last 4 digits[^\d]*(\d{4})\b/i,
    /card ending in[^\d]*(\d{4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function extractStatementPeriod(text: string): {
  start?: string;
  end?: string;
} {
  const match = new RegExp(
    `statement period[^\\dA-Za-z]*(${STATEMENT_DATE_PATTERN})\\s*(?:-|–|to)\\s*(${STATEMENT_DATE_PATTERN})`,
    "i",
  ).exec(text);
  if (!match) return {};

  const start = parseStatementDate(match[1]);
  const end = parseStatementDate(match[2]);

  return {
    start: start ?? undefined,
    end: end ?? undefined,
  };
}

function extractPaymentDueDate(text: string): string | undefined {
  const match =
    /payment due date[^\d]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(text) ??
    /due date[^\d]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(text);
  if (!match?.[1]) return undefined;
  return parseStatementDate(match[1]) ?? undefined;
}

function extractCreditLimitCents(text: string): number | undefined {
  const match =
    /credit (?:line|limit)[^$\d]*([$][\d,]+\.\d{2})/i.exec(text) ??
    /credit line amount[^$\d]*([$][\d,]+\.\d{2})/i.exec(text);
  if (!match?.[1]) return undefined;

  const cents = parseUsdToCents(match[1]);
  return cents === null ? undefined : Math.abs(cents);
}

function extractAprBps(text: string): number | undefined {
  const match =
    /apr(?: for purchases)?[^\d]*(\d+(?:\.\d+)?)%/i.exec(text) ??
    /purchase apr[^\d]*(\d+(?:\.\d+)?)%/i.exec(text);
  if (!match?.[1]) return undefined;

  const percent = Number.parseFloat(match[1]);
  if (!Number.isFinite(percent)) return undefined;
  return Math.round(percent * 100);
}

export function detectIssuer(input: Pick<ParserInput, "text" | "markdown">): IssuerDetection {
  const combined = compactWhitespace(
    [input.markdown, input.text].filter(Boolean).join("\n\n"),
  );
  if (!combined) return {};

  const matchedIssuer = matchIssuer(combined);
  if (!matchedIssuer) return {};

  const lastFour = extractLastFour(combined);
  const statementPeriod = extractStatementPeriod(combined);
  const paymentDueDate = extractPaymentDueDate(combined);

  return {
    issuer: matchedIssuer.issuer,
    issuerName: matchedIssuer.issuerName,
    accountSuggestion: lastFour
      ? {
          issuer: matchedIssuer.issuerName,
          lastFour,
          institution: matchedIssuer.issuerName,
          creditLimitCents: extractCreditLimitCents(combined),
          statementDay: getDayOfMonth(statementPeriod.end),
          paymentDueDay: getDayOfMonth(paymentDueDate),
          aprBps: extractAprBps(combined),
          statementPeriodStart: statementPeriod.start,
          statementPeriodEnd: statementPeriod.end,
        }
      : undefined,
  };
}
