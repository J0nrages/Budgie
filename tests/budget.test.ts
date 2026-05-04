import { describe, expect, test } from "vitest";
import {
  applyScenarioOverrides,
  computePace,
  computeTargetFunding,
  currentMonthYYYYMM,
  dayOfMonthInBudgetMonth,
  effectiveMonthlyLimitCents,
  monthBounds,
  projectBalance,
  projectBalanceMonths,
  prorateCost,
  waterfallBreakdown,
} from "../src/lib/budget";

describe("monthBounds", () => {
  test("returns correct end date", () => {
    const b = monthBounds("2024-01");
    expect(b.startDate).toBe("2024-01-01");
    expect(b.endDate).toBe("2024-01-31");
    expect(b.daysInMonth).toBe(31);
  });
});

describe("dayOfMonthInBudgetMonth", () => {
  test("clamps to month", () => {
    expect(dayOfMonthInBudgetMonth("2024-02", "2024-01-15")).toBe(1);
    expect(dayOfMonthInBudgetMonth("2024-02", "2024-03-01")).toBe(29);
    expect(dayOfMonthInBudgetMonth("2024-02", "2024-02-10")).toBe(10);
  });
});

describe("effectiveMonthlyLimitCents", () => {
  test("scales weekly and yearly", () => {
    expect(
      effectiveMonthlyLimitCents({ limitCents: 12_000, cadence: "weekly" }),
    ).toBe(Math.round((12_000 * 52) / 12));
    expect(
      effectiveMonthlyLimitCents({ limitCents: 120_000, cadence: "yearly" }),
    ).toBe(10_000);
    expect(
      effectiveMonthlyLimitCents({ limitCents: 5000, cadence: "monthly" }),
    ).toBe(5000);
  });
});

describe("prorateCost", () => {
  test("prorates by-date targets across remaining months", () => {
    expect(
      prorateCost({
        totalCents: 120_000,
        cadence: "byDate",
        targetDate: "2025-06-15",
        fromMonth: "2025-01",
      }),
    ).toBe(20_000);
  });
});

describe("computeTargetFunding", () => {
  test("supports refill up to and savings balance targets", () => {
    expect(
      computeTargetFunding({
        targetType: "spending",
        limitCents: 50_000,
        currentBalanceCents: 12_000,
        cadence: "monthly",
        refillBehavior: "refillUpTo",
      }),
    ).toBe(38_000);
    expect(
      computeTargetFunding({
        targetType: "savingsBalance",
        limitCents: 120_000,
        currentBalanceCents: 20_000,
        cadence: "byDate",
        targetDate: "2025-05-01",
        fromMonth: "2025-01",
        refillBehavior: "setAside",
      }),
    ).toBe(20_000);
  });
});

describe("computePace", () => {
  test("marks over budget when above limit", () => {
    const p = computePace({
      limitCents: 1000,
      actualCents: 1200,
      dayOfMonth: 10,
      daysInMonth: 30,
    });
    expect(p.paceStatus).toBe("overBudget");
  });
});

describe("applyScenarioOverrides", () => {
  test("replaces matching limits", () => {
    const out = applyScenarioOverrides(
      [
        { _id: "a", limitCents: 100 },
        { _id: "b", limitCents: 200 },
      ],
      [{ lineItemId: "b", limitCents: 999 }],
    );
    expect(out[0].limitCents).toBe(100);
    expect(out[1].limitCents).toBe(999);
  });
});

describe("projectBalanceMonths", () => {
  test("accumulates monthly delta", () => {
    const pts = projectBalanceMonths({
      months: 3,
      monthlyIncomeCents: 5000,
      monthlyExpenseBudgetCents: 4000,
    });
    expect(pts).toHaveLength(3);
    expect(pts[0].balanceCents).toBe(1000);
    expect(pts[2].balanceCents).toBe(3000);
  });
});

describe("waterfallBreakdown", () => {
  test("cascades income through tiers", () => {
    const w = waterfallBreakdown({
      incomeCents: 500_000,
      fixedItems: [{ amountCents: 200_000 }],
      flexibleItems: [{ amountCents: 100_000 }],
      savingsItems: [{ amountCents: 50_000 }],
    });
    expect(w.afterFixedCents).toBe(300_000);
    expect(w.afterFlexibleCents).toBe(200_000);
    expect(w.projectedSavingsCents).toBe(150_000);
  });
});

describe("projectBalance", () => {
  test("uses monthly expense items", () => {
    const pts = projectBalance({
      startBalanceCents: 1000,
      monthlyIncomeCents: 5000,
      monthlyExpenseItems: [{ amountCents: 1000 }, { amountCents: 500 }],
      months: 2,
    });
    expect(pts[0].balanceCents).toBe(4500);
    expect(pts[1].balanceCents).toBe(8000);
  });
});

describe("currentMonthYYYYMM", () => {
  test("formats YYYY-MM", () => {
    const s = currentMonthYYYYMM(new Date(2025, 0, 3));
    expect(s).toBe("2025-01");
  });
});
