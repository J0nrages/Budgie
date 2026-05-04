import type { Basis } from "@/types/finance";
import type { AccountLike, TransactionLike } from "./ledger";
import { transactionBasisDate } from "./ledger";

export type ExpandedMetricKind =
  | "net-worth"
  | "assets"
  | "liabilities"
  | "income"
  | "expenses"
  | "account";

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Inclusive calendar-day span between two YYYY-MM-DD strings (order-independent). */
export function inclusiveDaySpan(start: string, end: string): number {
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  const a = isoToUtcMs(lo);
  const b = isoToUtcMs(hi);
  return Math.floor((b - a) / 86_400_000) + 1;
}

function touchesAccount(tx: TransactionLike, accountId: string): boolean {
  if (tx.type === "transfer") {
    return tx.fromAccountId === accountId || tx.toAccountId === accountId;
  }
  return tx.accountId === accountId;
}

function touchesAnyAccount(tx: TransactionLike, ids: Set<string>): boolean {
  if (tx.type === "transfer") {
    return Boolean(
      (tx.fromAccountId && ids.has(tx.fromAccountId)) ||
        (tx.toAccountId && ids.has(tx.toAccountId)),
    );
  }
  return Boolean(tx.accountId && ids.has(tx.accountId));
}

function inDateRange(
  tx: TransactionLike,
  basis: Basis,
  startDate: string,
  endDate: string,
): boolean {
  const d = transactionBasisDate(tx, basis);
  if (!d) return false;
  return d >= startDate && d <= endDate;
}

/**
 * Transactions to show when the chart range is zoomed to a small window.
 * Broader ranges deliberately return an empty list — callers show the line only.
 */
export function transactionsForExpandedMetricRange(
  transactions: TransactionLike[],
  accounts: AccountLike[],
  basis: Basis,
  kind: ExpandedMetricKind,
  accountId: string | undefined,
  startDate: string,
  endDate: string,
): TransactionLike[] {
  const assetIds = new Set(
    accounts.filter((a) => a.type === "asset").map((a) => a._id),
  );
  const liabilityIds = new Set(
    accounts.filter((a) => a.type === "liability").map((a) => a._id),
  );
  const allIds = new Set(accounts.map((a) => a._id));

  return transactions
    .filter((tx) => {
      if (!inDateRange(tx, basis, startDate, endDate)) return false;
      switch (kind) {
        case "net-worth":
          return touchesAnyAccount(tx, allIds);
        case "assets":
          return touchesAnyAccount(tx, assetIds);
        case "liabilities":
          return touchesAnyAccount(tx, liabilityIds);
        case "income":
          return tx.type === "income" && Boolean(tx.accountId);
        case "expenses":
          return (
            (tx.type === "expense" ||
              tx.type === "fee" ||
              tx.type === "interest") &&
            Boolean(tx.accountId)
          );
        case "account":
          return accountId ? touchesAccount(tx, accountId) : false;
        default:
          return false;
      }
    })
    .sort((a, b) => {
      const da = transactionBasisDate(a, basis);
      const db = transactionBasisDate(b, basis);
      if (!da || !db) return 0;
      const c = db.localeCompare(da);
      if (c !== 0) return c;
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return b._id.localeCompare(a._id);
    });
}
