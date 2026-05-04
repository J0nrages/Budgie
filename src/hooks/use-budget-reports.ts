"use client";

import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

export function useMonthlyBudgetVsActual(
  budgetId: Id<"budgets"> | undefined,
  month: string | undefined,
  asOfDate?: string,
) {
  return useQuery(
    api.budgetReports.monthlyBudgetVsActual,
    budgetId && month
      ? {
          budgetId,
          month,
          ...(asOfDate ? { asOfDate } : {}),
        }
      : "skip",
  );
}

export function useWaterfallSummary(
  budgetId: Id<"budgets"> | undefined,
  month: string | undefined,
  asOfDate?: string,
) {
  return useQuery(
    api.budgetReports.waterfallSummary,
    budgetId && month
      ? {
          budgetId,
          month,
          ...(asOfDate ? { asOfDate } : {}),
        }
      : "skip",
  );
}

export function useBudgetTrendHistory(
  budgetId: Id<"budgets"> | undefined,
  months?: number,
) {
  return useQuery(
    api.budgetReports.budgetTrendHistory,
    budgetId
      ? { budgetId, ...(months !== undefined ? { months } : {}) }
      : "skip",
  );
}

export function useDetectMonthlyIncome(months?: number) {
  return useQuery(
    api.budgetReports.detectMonthlyIncome,
    months !== undefined ? { months } : {},
  );
}

export function useDetectRecurringBills(months?: number) {
  return useQuery(
    api.budgetReports.detectRecurringBills,
    months !== undefined ? { months } : {},
  );
}
