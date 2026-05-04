import type { Basis } from "@/types/finance";
import type { AccountLike, TransactionLike } from "./ledger";
import { netWorthCents, transactionBasisDate } from "./ledger";

export type FlowPeriod = "daily" | "weekly" | "monthly";

export type TrendPoint = {
  label: string;
  /** YYYY-MM-DD bucket / point date for sorting, brush zoom, and drill-down */
  date: string;
  valueCents: number;
};

function parseIsoDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = parseIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

function addWeeks(date: string, weeks: number): string {
  return addDays(date, weeks * 7);
}

function addMonths(date: string, months: number): string {
  const d = parseIsoDate(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toIsoDate(d);
}

function startOfWeek(date: string): string {
  const d = parseIsoDate(date);
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return toIsoDate(d);
}

function startOfMonth(date: string): string {
  const [year, month] = date.split("-");
  return `${year}-${month}-01`;
}

function periodKey(date: string, period: FlowPeriod): string {
  if (period === "weekly") return startOfWeek(date);
  if (period === "monthly") return startOfMonth(date);
  return date;
}

function periodLabel(key: string, period: FlowPeriod): string {
  if (period === "weekly") return `Week of ${key.slice(5)}`;
  if (period === "monthly") return key.slice(0, 7);
  return key.slice(5);
}

function periodWindowDays(period: FlowPeriod): number {
  if (period === "monthly") return 180;
  if (period === "weekly") return 84;
  return 14;
}

function addPeriod(key: string, period: FlowPeriod, amount: number): string {
  if (period === "weekly") return startOfWeek(addWeeks(key, amount));
  if (period === "monthly") return startOfMonth(addMonths(key, amount));
  return addDays(key, amount);
}

function buildPeriodKeys(
  latestDate: string,
  earliestDate: string,
  period: FlowPeriod,
): string[] {
  const keys: string[] = [];
  let cursor = periodKey(earliestDate, period);
  const end = periodKey(latestDate, period);

  while (cursor <= end) {
    keys.push(cursor);
    cursor = addPeriod(cursor, period, 1);
  }

  return keys;
}

function flowAmountForKind(
  transaction: TransactionLike,
  kind: "income" | "expense",
): number {
  if (kind === "income") {
    return transaction.type === "income" && transaction.accountId
      ? transaction.amountCents
      : 0;
  }

  return (
    (transaction.type === "expense" ||
      transaction.type === "fee" ||
      transaction.type === "interest") &&
    transaction.accountId
      ? transaction.amountCents
      : 0
  );
}

export function buildNetWorthTrend(
  accounts: AccountLike[],
  transactions: TransactionLike[],
  basis: Basis,
): TrendPoint[] {
  const dates = Array.from(
    new Set(
      transactions
        .map((transaction) => transactionBasisDate(transaction, basis))
        .filter((date): date is string => date !== null),
    ),
  ).sort();

  if (dates.length === 0) {
    const today = toIsoDate(new Date());
    return [
      {
        label: "Today",
        date: today,
        valueCents: netWorthCents(accounts, [], basis),
      },
    ];
  }

  const latestDate = dates.at(-1)!;
  const earliestDate = dates.length > 1 ? dates[0] : addDays(latestDate, -7);
  const trendDates = Array.from(
    new Set([
      addDays(earliestDate, -1),
      ...Array.from({ length: 43 }, (_, index) =>
        addDays(addDays(latestDate, -42), index),
      ),
      ...dates,
    ]),
  )
    .filter((date) => date <= latestDate)
    .sort()
    .slice(-30);

  return trendDates.map((date) => ({
    label: date.slice(5),
    date,
    valueCents: netWorthCents(
      accounts,
      transactions.filter((transaction) => {
        const basisDate = transactionBasisDate(transaction, basis);
        return basisDate !== null && basisDate <= date;
      }),
      basis,
    ),
  }));
}

export function buildFlowTrend(
  transactions: TransactionLike[],
  basis: Basis,
  period: FlowPeriod,
  kind: "income" | "expense",
): TrendPoint[] {
  const datedTransactions = transactions
    .map((transaction) => ({
      transaction,
      date: transactionBasisDate(transaction, basis),
    }))
    .filter(
      (entry): entry is { transaction: TransactionLike; date: string } =>
        entry.date !== null,
    );

  const latestDate = datedTransactions.map((entry) => entry.date).sort().at(-1);
  if (!latestDate) return [];
  const earliestDate = addDays(latestDate, -periodWindowDays(period));
  const buckets = new Map<string, number>();

  for (const { transaction, date } of datedTransactions) {
    if (date < earliestDate) continue;
    const amount = flowAmountForKind(transaction, kind);
    if (amount === 0) continue;
    const key = periodKey(date, period);
    buckets.set(key, (buckets.get(key) ?? 0) + amount);
  }

  return buildPeriodKeys(latestDate, earliestDate, period).map((key) => ({
    label: periodLabel(key, period),
    date: key,
    valueCents: buckets.get(key) ?? 0,
  }));
}

export function currentFlowPeriodTotal(
  transactions: TransactionLike[],
  basis: Basis,
  period: FlowPeriod,
  kind: "income" | "expense",
): number {
  const trend = buildFlowTrend(transactions, basis, period, kind);
  return trend.at(-1)?.valueCents ?? 0;
}
