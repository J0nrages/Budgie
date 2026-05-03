import type { AccountType, Basis, TransactionType } from "../types/finance";
import { compareIsoDates } from "./dates";

export type AccountLike = {
  _id: string;
  name: string;
  type: AccountType;
  initialBalanceCents: number;
};

export type TransactionLike = {
  _id: string;
  type: TransactionType;
  amountCents: number;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  description: string;
  incurredDate: string;
  isCleared: boolean;
  clearedDate?: string;
  createdAt: number;
};

export type LedgerLine = {
  transactionId: string;
  accountId: string;
  /** Basis-relevant date used for ordering */
  sortDate: string;
  incurredDate: string;
  clearedDate?: string;
  description: string;
  type: TransactionType;
  /** Signed change to this account balance */
  deltaCents: number;
  /** transfer leg label for stable sorting */
  leg: "primary" | "transfer-out" | "transfer-in";
  runningBalanceCents: number;
};

export function transactionBasisDate(
  tx: TransactionLike,
  basis: Basis,
): string | null {
  if (basis === "cash") {
    if (!tx.isCleared || !tx.clearedDate) return null;
    return tx.clearedDate;
  }
  return tx.incurredDate;
}

function compareTxForBasis(
  a: TransactionLike,
  b: TransactionLike,
  basis: Basis,
): number {
  const da = transactionBasisDate(a, basis);
  const db = transactionBasisDate(b, basis);
  if (!da || !db) return 0;
  const c = compareIsoDates(da, db);
  if (c !== 0) return c;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a._id.localeCompare(b._id);
}

function signedDeltaForAccount(
  tx: TransactionLike,
  accountId: string,
): { delta: number; leg: LedgerLine["leg"] } | null {
  const { type, amountCents } = tx;
  if (type === "transfer") {
    if (tx.fromAccountId === accountId) {
      return { delta: -amountCents, leg: "transfer-out" };
    }
    if (tx.toAccountId === accountId) {
      return { delta: amountCents, leg: "transfer-in" };
    }
    return null;
  }

  if (tx.accountId !== accountId) return null;
  if (
    type === "expense" ||
    type === "fee" ||
    type === "interest"
  ) {
    return { delta: -amountCents, leg: "primary" };
  }
  if (type === "income" || type === "payment") {
    return { delta: amountCents, leg: "primary" };
  }
  return null;
}

function compareLines(a: LedgerLine, b: LedgerLine): number {
  const c = compareIsoDates(a.sortDate, b.sortDate);
  if (c !== 0) return c;
  if (a.transactionId !== b.transactionId) {
    return a.transactionId.localeCompare(b.transactionId);
  }
  const legRank = (l: LedgerLine["leg"]) =>
    l === "transfer-out" ? 0 : l === "primary" ? 1 : 2;
  return legRank(a.leg) - legRank(b.leg);
}

/**
 * Expand transactions into per-account ledger lines with running balances.
 * Lines are sorted ascending by basis date for math, then reversed for newest-first display.
 */
export function buildAccountLedger(
  account: AccountLike,
  transactions: TransactionLike[],
  basis: Basis,
): LedgerLine[] {
  const relevant = transactions
    .filter((tx) => transactionBasisDate(tx, basis) !== null)
    .sort((a, b) => compareTxForBasis(a, b, basis));

  const linesAsc: LedgerLine[] = [];

  for (const tx of relevant) {
    const sortDate = transactionBasisDate(tx, basis);
    if (!sortDate) continue;
    const hit = signedDeltaForAccount(tx, account._id);
    if (!hit) continue;
    linesAsc.push({
      transactionId: tx._id,
      accountId: account._id,
      sortDate,
      incurredDate: tx.incurredDate,
      clearedDate: tx.clearedDate,
      description: tx.description,
      type: tx.type,
      deltaCents: hit.delta,
      leg: hit.leg,
      runningBalanceCents: 0,
    });
  }

  linesAsc.sort(compareLines);

  let running = account.initialBalanceCents;
  for (const line of linesAsc) {
    running += line.deltaCents;
    line.runningBalanceCents = running;
  }

  return linesAsc.slice().reverse();
}

export function netWorthCents(
  accounts: AccountLike[],
  transactions: TransactionLike[],
  basis: Basis,
): number {
  let total = 0;
  for (const a of accounts) {
    const lines = buildAccountLedger(a, transactions, basis);
    const bal =
      lines.length === 0
        ? a.initialBalanceCents
        : lines[0].runningBalanceCents;
    total += bal;
  }
  return total;
}

export function sumIncomeExpense(
  transactions: TransactionLike[],
  basis: Basis,
): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (transactionBasisDate(tx, basis) === null) continue;
    if (tx.type === "income" && tx.accountId) income += tx.amountCents;
    else if (
      (tx.type === "expense" ||
        tx.type === "fee" ||
        tx.type === "interest") &&
      tx.accountId
    ) {
      expense += tx.amountCents;
    }
  }
  return { income, expense };
}
