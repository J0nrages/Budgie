/**
 * Budget math shared by Convex budget reports (no imports from `src/`).
 */

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

/** 1-based day index within `month` for `asOfDate` (YYYY-MM-DD). Clamped to month. */
export function dayOfMonthInBudgetMonth(
  monthYYYYMM: string,
  asOfDate: string,
): number {
  const { startDate, endDate, daysInMonth } = monthBounds(monthYYYYMM);
  if (asOfDate < startDate) return 1;
  if (asOfDate > endDate) return daysInMonth;
  return Number(asOfDate.slice(8, 10));
}

export type PaceStatus =
  | "underPace"
  | "nearPace"
  | "overPace"
  | "overBudget";

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

/** Effective monthly budget amount for waterfall totals (approximate for weekly). */
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
