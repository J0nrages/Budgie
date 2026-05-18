/**
 * Shared formatters used in tool descriptions, proposal summaries shown
 * to the human at approval time, and the verbatim text the model gets
 * back as the tool result. Money is stored as integer cents in Convex —
 * never expose raw cents to the model.
 */

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCentsAsDollars(cents: number): string {
  return usd.format(cents / 100);
}

export function formatIsoDateRange(start: string, end: string): string {
  return `${start} → ${end}`;
}

export function trimList<T>(items: T[], max: number): { shown: T[]; truncated: number } {
  if (items.length <= max) return { shown: items, truncated: 0 };
  return { shown: items.slice(0, max), truncated: items.length - max };
}

/**
 * Compact a transaction reference for inclusion in a proposal summary.
 * Always include exact date + dollar amount + description so the human
 * (and the model) can verify the action against what's in the ledger.
 */
export function formatTransactionLine(args: {
  incurredDate: string;
  description: string;
  amountCents: number;
  accountName?: string;
}): string {
  const acct = args.accountName ? ` (${args.accountName})` : "";
  return `${args.incurredDate} ${formatCentsAsDollars(args.amountCents)} — ${args.description}${acct}`;
}
