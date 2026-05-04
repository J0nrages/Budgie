/**
 * Pure budget helpers for the client/tests (mirrors `convex/lib/budgetMath.ts`).
 */

import type { BudgetCadence, BudgetTargetType, PaceStatus } from "@/types/budget";

export function monthBounds(monthYYYYMM: string): {
  startDate: string;
  endDate: string;
  daysInMonth: number;
} {
  const [ys, ms] = monthYYYYMM.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error(`Invalid month: ${monthYYYYMM}`);
  }
  const startDate = `${monthYYYYMM}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endDate = `${monthYYYYMM}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate, daysInMonth: lastDay };
}

export function dayOfMonthInBudgetMonth(
  monthYYYYMM: string,
  asOfDate: string,
): number {
  const { startDate, endDate, daysInMonth } = monthBounds(monthYYYYMM);
  if (asOfDate < startDate) return 1;
  if (asOfDate > endDate) return daysInMonth;
  return Number(asOfDate.slice(8, 10));
}

export function computePace(args: {
  limitCents: number;
  actualCents: number;
  dayOfMonth: number;
  daysInMonth: number;
}): {
  expectedPercentByPace: number;
  percentUsed: number;
  paceStatus: PaceStatus;
} {
  const { limitCents, actualCents, dayOfMonth, daysInMonth } = args;
  if (limitCents <= 0) {
    return {
      expectedPercentByPace: 0,
      percentUsed: 0,
      paceStatus: actualCents > 0 ? "overBudget" : "underPace",
    };
  }
  const percentUsed = Math.round((100 * actualCents) / limitCents);
  const expectedLinear = Math.round(
    (limitCents * dayOfMonth) / Math.max(daysInMonth, 1),
  );
  const expectedPercentByPace = Math.round(
    (100 * expectedLinear) / limitCents,
  );

  if (actualCents > limitCents) {
    return { expectedPercentByPace, percentUsed, paceStatus: "overBudget" };
  }

  const band = Math.max(Math.round(0.1 * limitCents), 1);
  const delta = actualCents - expectedLinear;
  if (delta > band) {
    return { expectedPercentByPace, percentUsed, paceStatus: "overPace" };
  }
  if (delta < -band) {
    return { expectedPercentByPace, percentUsed, paceStatus: "underPace" };
  }
  return { expectedPercentByPace, percentUsed, paceStatus: "nearPace" };
}

export function effectiveMonthlyLimitCents(args: {
  limitCents: number;
  cadence: "weekly" | "monthly" | "yearly" | "byDate";
}): number {
  const { limitCents, cadence } = args;
  if (cadence === "weekly") {
    return Math.round((limitCents * 52) / 12);
  }
  if (cadence === "yearly") {
    return Math.round(limitCents / 12);
  }
  return limitCents;
}

export function prorateCost(args: {
  totalCents: number;
  cadence: BudgetCadence;
  targetDate?: string;
  fromMonth?: string;
}): number {
  const { totalCents, cadence } = args;
  if (totalCents <= 0) return 0;
  if (cadence === "weekly") return Math.round((totalCents * 52) / 12);
  if (cadence === "yearly") return Math.round(totalCents / 12);
  if (cadence === "monthly") return totalCents;

  if (!args.targetDate) return totalCents;
  const fromMonth = args.fromMonth ?? currentMonthYYYYMM();
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = args.targetDate.slice(0, 7).split("-").map(Number);
  const monthCount = Math.max((ty - fy) * 12 + (tm - fm) + 1, 1);
  return Math.ceil(totalCents / monthCount);
}

export function computeTargetFunding(args: {
  targetType: BudgetTargetType;
  limitCents: number;
  currentBalanceCents?: number;
  cadence: BudgetCadence;
  refillBehavior: "setAside" | "refillUpTo";
  targetDate?: string;
  fromMonth?: string;
}): number {
  const current = Math.max(args.currentBalanceCents ?? 0, 0);
  if (args.targetType === "savingsBalance") {
    return Math.max(
      0,
      prorateCost({
        totalCents: args.limitCents - current,
        cadence: args.targetDate ? "byDate" : args.cadence,
        targetDate: args.targetDate,
        fromMonth: args.fromMonth,
      }),
    );
  }

  const periodTarget = prorateCost({
    totalCents: args.limitCents,
    cadence: args.cadence,
    targetDate: args.targetDate,
    fromMonth: args.fromMonth,
  });

  if (args.refillBehavior === "refillUpTo") {
    return Math.max(0, periodTarget - current);
  }
  return periodTarget;
}

export function waterfallBreakdown(args: {
  incomeCents: number;
  fixedItems: readonly { amountCents: number }[];
  flexibleItems: readonly { amountCents: number }[];
  savingsItems: readonly { amountCents: number }[];
}): {
  incomeCents: number;
  fixedCents: number;
  afterFixedCents: number;
  flexibleCents: number;
  afterFlexibleCents: number;
  savingsCents: number;
  projectedSavingsCents: number;
} {
  const sum = (items: readonly { amountCents: number }[]) =>
    items.reduce((total, item) => total + item.amountCents, 0);
  const fixedCents = sum(args.fixedItems);
  const afterFixedCents = args.incomeCents - fixedCents;
  const flexibleCents = sum(args.flexibleItems);
  const afterFlexibleCents = afterFixedCents - flexibleCents;
  const savingsCents = sum(args.savingsItems);
  return {
    incomeCents: args.incomeCents,
    fixedCents,
    afterFixedCents,
    flexibleCents,
    afterFlexibleCents,
    savingsCents,
    projectedSavingsCents: afterFlexibleCents - savingsCents,
  };
}

export function addMonthsYYYYMM(monthYYYYMM: string, delta: number): string {
  const [yS, mS] = monthYYYYMM.split("-");
  const y = Number(yS);
  const m = Number(mS);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function currentMonthYYYYMM(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type ScenarioLineOverride = {
  lineItemId: string;
  limitCents: number;
};

export function applyScenarioOverrides<
  T extends { _id: string; limitCents: number },
>(
  lineItems: readonly T[],
  overrides: readonly ScenarioLineOverride[],
): T[] {
  const map = new Map(
    overrides.map((o) => [o.lineItemId, o.limitCents] as const),
  );
  return lineItems.map((li) => {
    const lim = map.get(li._id);
    return lim !== undefined ? { ...li, limitCents: lim } : li;
  });
}

/** Running savings balance after each month (simple income − budgeted spend ± adjustment). */
export function projectBalanceMonths(args: {
  months: number;
  monthlyIncomeCents: number;
  monthlyExpenseBudgetCents: number;
  monthlyAdjustmentCents?: number;
  startBalanceCents?: number;
}): { monthOffset: number; balanceCents: number }[] {
  let b = args.startBalanceCents ?? 0;
  const adj = args.monthlyAdjustmentCents ?? 0;
  const out: { monthOffset: number; balanceCents: number }[] = [];
  for (let i = 0; i < args.months; i += 1) {
    b +=
      args.monthlyIncomeCents - args.monthlyExpenseBudgetCents + adj;
    out.push({ monthOffset: i, balanceCents: b });
  }
  return out;
}

export function projectBalance(args: {
  startBalanceCents: number;
  monthlyIncomeCents: number;
  monthlyExpenseItems: readonly { amountCents: number }[];
  months: number;
}): { monthOffset: number; balanceCents: number }[] {
  const monthlyExpenseBudgetCents = args.monthlyExpenseItems.reduce(
    (total, item) => total + item.amountCents,
    0,
  );
  return projectBalanceMonths({
    startBalanceCents: args.startBalanceCents,
    monthlyIncomeCents: args.monthlyIncomeCents,
    monthlyExpenseBudgetCents,
    months: args.months,
  });
}
