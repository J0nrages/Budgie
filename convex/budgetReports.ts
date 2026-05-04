import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import {
  computePace,
  dayOfMonthInBudgetMonth,
  effectiveMonthlyLimitCents,
  monthBounds,
} from "./lib/budgetMath";
import { normalizeCategoryKey } from "./lib/categories";

async function loadTransactionsInRange(
  ctx: QueryCtx,
  args: { startDate: string; endDate: string },
): Promise<Doc<"transactions">[]> {
  return await ctx.db
    .query("transactions")
    .withIndex("by_incurredDate", (q) =>
      q.gte("incurredDate", args.startDate).lte("incurredDate", args.endDate),
    )
    .collect();
}

function expenseLikeCents(t: Doc<"transactions">): number {
  if (t.type === "expense" || t.type === "fee" || t.type === "interest") {
    return t.amountCents;
  }
  return 0;
}

function incomeLikeCents(t: Doc<"transactions">): number {
  if (t.type === "income" && t.accountId) return t.amountCents;
  return 0;
}

async function latestIncurredDate(ctx: QueryCtx): Promise<string | null> {
  const txs = await ctx.db.query("transactions").collect();
  let max: string | null = null;
  for (const t of txs) {
    if (!max || t.incurredDate > max) max = t.incurredDate;
  }
  return max;
}

function addMonthsYYYYMM(monthYYYYMM: string, delta: number): string {
  const [yS, mS] = monthYYYYMM.split("-");
  const y = Number(yS);
  const m = Number(mS);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

const merchantBillValidator = v.object({
  key: v.string(),
  merchantName: v.optional(v.string()),
  category: v.optional(v.string()),
  averageAmountCents: v.number(),
  lastAmountCents: v.number(),
  occurrenceCount: v.number(),
  lastDate: v.string(),
  confidence: v.number(),
});

export const detectMonthlyIncome = query({
  args: { months: v.optional(v.number()) },
  returns: v.object({
    suggestedMonthlyIncomeCents: v.number(),
    samples: v.number(),
    windowEndMonth: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const months = Math.min(Math.max(args.months ?? 6, 1), 36);
    const latest = await latestIncurredDate(ctx);
    if (!latest) {
      return {
        suggestedMonthlyIncomeCents: 0,
        samples: 0,
        windowEndMonth: undefined,
      };
    }
    const endMonth = latest.slice(0, 7);
    const startMonth = addMonthsYYYYMM(endMonth, -(months - 1));
    const startDate = `${startMonth}-01`;
    const endDate = monthBounds(endMonth).endDate;

    const txs = await loadTransactionsInRange(ctx, { startDate, endDate });
    let sum = 0;
    let count = 0;
    for (const t of txs) {
      const inc = incomeLikeCents(t);
      if (inc > 0) {
        sum += inc;
        count += 1;
      }
    }
    const suggestedMonthlyIncomeCents =
      months > 0 ? Math.round(sum / months) : 0;
    return {
      suggestedMonthlyIncomeCents,
      samples: count,
      windowEndMonth: endMonth,
    };
  },
});

export const detectRecurringBills = query({
  args: {
    months: v.optional(v.number()),
    toleranceBps: v.optional(v.number()),
  },
  returns: v.array(merchantBillValidator),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const months = Math.min(Math.max(args.months ?? 6, 1), 24);
    const toleranceBps = Math.min(args.toleranceBps ?? 800, 5000);

    const latest = await latestIncurredDate(ctx);
    if (!latest) return [];

    const endMonth = latest.slice(0, 7);
    const startMonth = addMonthsYYYYMM(endMonth, -(months - 1));
    const startDate = `${startMonth}-01`;
    const endDate = monthBounds(endMonth).endDate;

    const txs = await loadTransactionsInRange(ctx, { startDate, endDate });
    const expenseTxs = txs.filter(
      (t) =>
        (t.type === "expense" || t.type === "fee" || t.type === "interest") &&
        t.accountId,
    );

    type Cluster = {
      key: string;
      merchantName?: string;
      category?: string;
      amounts: number[];
      dates: string[];
    };

    const clusters = new Map<string, Cluster>();
    for (const t of expenseTxs) {
      const merchant = (t.merchantName ?? "").trim();
      const cat = (t.category ?? "").trim();
      const key =
        merchant.length > 0
          ? `m:${normalizeCategoryKey(merchant)}`
          : cat.length > 0
            ? `c:${normalizeCategoryKey(cat)}`
            : `d:${normalizeCategoryKey(t.description.slice(0, 48))}`;
      const cur =
        clusters.get(key) ??
        ({
          key,
          merchantName: merchant.length > 0 ? merchant : undefined,
          category: cat.length > 0 ? cat : undefined,
          amounts: [],
          dates: [],
        } as Cluster);
      cur.amounts.push(t.amountCents);
      cur.dates.push(t.incurredDate);
      clusters.set(key, cur);
    }

    const results: {
      key: string;
      merchantName?: string;
      category?: string;
      averageAmountCents: number;
      lastAmountCents: number;
      occurrenceCount: number;
      lastDate: string;
      confidence: number;
    }[] = [];

    for (const c of clusters.values()) {
      if (c.dates.length < 2) continue;
      c.dates.sort();
      const avg = Math.round(
        c.amounts.reduce((s, x) => s + x, 0) / c.amounts.length,
      );
      const ref = c.amounts[0];
      const similar = c.amounts.every((a) =>
        Math.abs(a - ref) <= Math.round((ref * toleranceBps) / 10_000),
      );
      if (!similar) continue;

      let intervalsOk = true;
      for (let i = 1; i < c.dates.length; i += 1) {
        const a = new Date(`${c.dates[i - 1]}T12:00:00Z`).getTime();
        const b = new Date(`${c.dates[i]}T12:00:00Z`).getTime();
        const days = Math.round((b - a) / 86_400_000);
        if (days < 20 || days > 45) {
          intervalsOk = false;
          break;
        }
      }
      if (!intervalsOk && c.dates.length < 3) continue;

      const lastDate = c.dates[c.dates.length - 1];
      const lastAmount = c.amounts[c.amounts.length - 1];
      const confidence = Math.min(
        1,
        (c.dates.length / months) * (similar ? 1 : 0.5),
      );

      results.push({
        key: c.key,
        merchantName: c.merchantName,
        category: c.category,
        averageAmountCents: avg,
        lastAmountCents: lastAmount,
        occurrenceCount: c.dates.length,
        lastDate,
        confidence,
      });
    }

    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 40);
  },
});

function waterfallTierForLineItem(
  ctxCats: Doc<"categories">[],
  ctxGroups: Map<Id<"categoryGroups">, Doc<"categoryGroups">>,
  line: Doc<"budgetLineItems">,
): "fixed" | "flexible" | "savings" {
  if (line.categoryGroupId) {
    const g = ctxGroups.get(line.categoryGroupId);
    const t = g?.waterfallTier ?? "flexible";
    if (t === "income") return "fixed";
    return t === "savings" ? "savings" : t === "fixed" ? "fixed" : "flexible";
  }
  if (line.categoryId) {
    const cat = ctxCats.find((c) => c._id === line.categoryId);
    const g = cat ? ctxGroups.get(cat.groupId) : undefined;
    const t = g?.waterfallTier ?? "flexible";
    if (t === "income") return "fixed";
    return t === "savings" ? "savings" : t === "fixed" ? "fixed" : "flexible";
  }
  return "flexible";
}

async function resolveBudget(
  ctx: QueryCtx,
  budgetId: Id<"budgets"> | undefined,
): Promise<Doc<"budgets"> | null> {
  if (budgetId) return await ctx.db.get(budgetId);
  return await ctx.db
    .query("budgets")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .first();
}

const tierSummaryValidator = v.object({
  tier: v.union(
    v.literal("fixed"),
    v.literal("flexible"),
    v.literal("savings"),
  ),
  budgetedCents: v.number(),
  actualCents: v.number(),
  remainingCents: v.number(),
});

const lineDetailValidator = v.object({
  lineItemId: v.id("budgetLineItems"),
  targetName: v.string(),
  targetScope: v.union(v.literal("category"), v.literal("group")),
  targetType: v.union(
    v.literal("spending"),
    v.literal("savingsBalance"),
    v.literal("monthlyBuilder"),
  ),
  limitCents: v.number(),
  actualCents: v.number(),
  remainingCents: v.number(),
  percentUsed: v.number(),
  expectedPercentByPace: v.number(),
  paceStatus: v.union(
    v.literal("underPace"),
    v.literal("nearPace"),
    v.literal("overPace"),
    v.literal("overBudget"),
  ),
  tier: v.union(
    v.literal("fixed"),
    v.literal("flexible"),
    v.literal("savings"),
  ),
});

const unbudgetedCatValidator = v.object({
  category: v.string(),
  actualCents: v.number(),
  transactionCount: v.number(),
});

export const waterfallSummary = query({
  args: {
    budgetId: v.optional(v.id("budgets")),
    month: v.string(),
    asOfDate: v.optional(v.string()),
  },
  returns: v.object({
    month: v.string(),
    budgetId: v.id("budgets"),
    monthlyIncomeCents: v.number(),
    tiers: v.array(tierSummaryValidator),
    projectedSavingsCents: v.number(),
    unbudgetedSpendCents: v.number(),
    unbudgetedCategories: v.array(unbudgetedCatValidator),
  }),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const budget = await resolveBudget(ctx, args.budgetId);
    if (!budget) throw new Error("No budget found");

    const { startDate, endDate } = monthBounds(args.month);
    const asOf = args.asOfDate ?? endDate;

    const lineItems = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_budget_sort", (q) => q.eq("budgetId", budget._id))
      .collect();
    lineItems.sort((a, b) => a.sortOrder - b.sortOrder);

    const categories = await ctx.db.query("categories").collect();
    const groups = await ctx.db.query("categoryGroups").collect();
    const groupMap = new Map(groups.map((g) => [g._id, g]));

    const txs = await loadTransactionsInRange(ctx, { startDate, endDate });

    const keyToCategoryId = new Map<string, Id<"categories">>();
    for (const c of categories) {
      keyToCategoryId.set(c.normalizedKey, c._id);
    }

    const dedicatedCategoryIds = new Set<Id<"categories">>();
    for (const li of lineItems) {
      if (li.categoryId) dedicatedCategoryIds.add(li.categoryId);
    }

    function actualForCategory(catId: Id<"categories">): number {
      const cat = categories.find((c) => c._id === catId);
      if (!cat) return 0;
      const nk = cat.normalizedKey;
      let sum = 0;
      for (const t of txs) {
        const raw = (t.category ?? "").trim();
        if (raw.length === 0) continue;
        if (normalizeCategoryKey(raw) !== nk) continue;
        sum += expenseLikeCents(t);
      }
      return sum;
    }

    function actualForGroup(groupId: Id<"categoryGroups">): number {
      const catsInGroup = categories.filter((c) => c.groupId === groupId);
      let sum = 0;
      for (const c of catsInGroup) {
        if (dedicatedCategoryIds.has(c._id)) continue;
        sum += actualForCategory(c._id);
      }
      return sum;
    }

    const byTier: Record<
      "fixed" | "flexible" | "savings",
      { budgeted: number; actual: number }
    > = {
      fixed: { budgeted: 0, actual: 0 },
      flexible: { budgeted: 0, actual: 0 },
      savings: { budgeted: 0, actual: 0 },
    };

    for (const li of lineItems) {
      const tier = waterfallTierForLineItem(categories, groupMap, li);
      const monthlyLimit = effectiveMonthlyLimitCents({
        limitCents: li.limitCents,
        cadence: li.cadence,
      });
      byTier[tier].budgeted += monthlyLimit;

      const actual = li.categoryId
        ? actualForCategory(li.categoryId)
        : li.categoryGroupId
          ? actualForGroup(li.categoryGroupId)
          : 0;
      byTier[tier].actual += actual;
    }

    const unbudgetedMap = new Map<string, { cents: number; n: number }>();
    for (const t of txs) {
      const raw = (t.category ?? "").trim();
      if (raw.length === 0) continue;
      const nk = normalizeCategoryKey(raw);
      const cid = keyToCategoryId.get(nk);
      let covered = false;
      if (cid) {
        for (const li of lineItems) {
          if (li.categoryId === cid) {
            covered = true;
            break;
          }
          if (li.categoryGroupId) {
            const cat = categories.find((c) => c._id === cid);
            if (cat && cat.groupId === li.categoryGroupId) {
              if (!dedicatedCategoryIds.has(cid)) covered = true;
            }
          }
        }
      }
      if (covered) continue;
      const exp = expenseLikeCents(t);
      if (exp === 0) continue;
      const cur = unbudgetedMap.get(nk) ?? { cents: 0, n: 0 };
      cur.cents += exp;
      cur.n += 1;
      unbudgetedMap.set(nk, cur);
    }

    let unbudgetedSpendCents = 0;
    const unbudgetedCategories = [...unbudgetedMap.entries()].map(
      ([key, v]) => {
        unbudgetedSpendCents += v.cents;
        return {
          category: key,
          actualCents: v.cents,
          transactionCount: v.n,
        };
      },
    );

    const totalBudgeted =
      byTier.fixed.budgeted +
      byTier.flexible.budgeted +
      byTier.savings.budgeted;
    const projectedSavingsCents = Math.max(
      0,
      budget.monthlyIncomeCents - totalBudgeted,
    );

    const tiersOut = (
      ["fixed", "flexible", "savings"] as const
    ).map((tier) => ({
      tier,
      budgetedCents: byTier[tier].budgeted,
      actualCents: byTier[tier].actual,
      remainingCents: Math.max(0, byTier[tier].budgeted - byTier[tier].actual),
    }));

    void asOf;

    return {
      month: args.month,
      budgetId: budget._id,
      monthlyIncomeCents: budget.monthlyIncomeCents,
      tiers: tiersOut,
      projectedSavingsCents,
      unbudgetedSpendCents,
      unbudgetedCategories: unbudgetedCategories.sort(
        (a, b) => b.actualCents - a.actualCents,
      ),
    };
  },
});

export const monthlyBudgetVsActual = query({
  args: {
    budgetId: v.optional(v.id("budgets")),
    month: v.string(),
    asOfDate: v.optional(v.string()),
  },
  returns: v.object({
    month: v.string(),
    budgetId: v.id("budgets"),
    monthlyIncomeCents: v.number(),
    lineItems: v.array(lineDetailValidator),
    projectedSavingsCents: v.number(),
    unbudgetedSpendCents: v.number(),
    unbudgetedCategories: v.array(unbudgetedCatValidator),
    paceContext: v.object({
      asOfDate: v.string(),
      dayOfMonth: v.number(),
      daysInMonth: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const budget = await resolveBudget(ctx, args.budgetId);
    if (!budget) throw new Error("No budget found");

    const { startDate, endDate, daysInMonth } = monthBounds(args.month);
    const asOf = args.asOfDate ?? endDate;
    const dayOfMonth = dayOfMonthInBudgetMonth(args.month, asOf);

    const lineItems = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_budget_sort", (q) => q.eq("budgetId", budget._id))
      .collect();
    lineItems.sort((a, b) => a.sortOrder - b.sortOrder);

    const categories = await ctx.db.query("categories").collect();
    const groups = await ctx.db.query("categoryGroups").collect();
    const groupMap = new Map(groups.map((g) => [g._id, g]));

    const txs = await loadTransactionsInRange(ctx, { startDate, endDate });

    const dedicatedCategoryIds = new Set<Id<"categories">>();
    for (const li of lineItems) {
      if (li.categoryId) dedicatedCategoryIds.add(li.categoryId);
    }

    function actualForCategory(catId: Id<"categories">): number {
      const cat = categories.find((c) => c._id === catId);
      if (!cat) return 0;
      const nk = cat.normalizedKey;
      let sum = 0;
      for (const t of txs) {
        const raw = (t.category ?? "").trim();
        if (raw.length === 0) continue;
        if (normalizeCategoryKey(raw) !== nk) continue;
        sum += expenseLikeCents(t);
      }
      return sum;
    }

    function actualForGroup(groupId: Id<"categoryGroups">): number {
      const catsInGroup = categories.filter((c) => c.groupId === groupId);
      let sum = 0;
      for (const c of catsInGroup) {
        if (dedicatedCategoryIds.has(c._id)) continue;
        sum += actualForCategory(c._id);
      }
      return sum;
    }

    const keyToCategoryId = new Map<string, Id<"categories">>();
    for (const c of categories) {
      keyToCategoryId.set(c.normalizedKey, c._id);
    }

    const details: {
      lineItemId: Id<"budgetLineItems">;
      targetName: string;
      targetScope: "category" | "group";
      targetType: "spending" | "savingsBalance" | "monthlyBuilder";
      limitCents: number;
      actualCents: number;
      remainingCents: number;
      percentUsed: number;
      expectedPercentByPace: number;
      paceStatus:
        | "underPace"
        | "nearPace"
        | "overPace"
        | "overBudget";
      tier: "fixed" | "flexible" | "savings";
    }[] = [];

    let totalBudgeted = 0;
    for (const li of lineItems) {
      const tier = waterfallTierForLineItem(categories, groupMap, li);
      const monthlyLimit = effectiveMonthlyLimitCents({
        limitCents: li.limitCents,
        cadence: li.cadence,
      });
      totalBudgeted += monthlyLimit;

      const actual = li.categoryId
        ? actualForCategory(li.categoryId)
        : li.categoryGroupId
          ? actualForGroup(li.categoryGroupId)
          : 0;

      let targetName = "Budget line";
      let targetScope: "category" | "group" = "category";
      if (li.categoryId) {
        const c = await ctx.db.get(li.categoryId);
        targetName = c?.name ?? targetName;
        targetScope = "category";
      } else if (li.categoryGroupId) {
        const g = await ctx.db.get(li.categoryGroupId);
        targetName = g?.name ?? targetName;
        targetScope = "group";
      }

      const pace = computePace({
        limitCents: monthlyLimit,
        actualCents: actual,
        dayOfMonth,
        daysInMonth,
      });
      details.push({
        lineItemId: li._id,
        targetName,
        targetScope,
        targetType: li.targetType,
        limitCents: monthlyLimit,
        actualCents: actual,
        remainingCents: Math.max(0, monthlyLimit - actual),
        percentUsed: pace.percentUsed,
        expectedPercentByPace: pace.expectedPercentByPace,
        paceStatus: pace.paceStatus,
        tier,
      });
    }

    const unbudgetedMap = new Map<string, { cents: number; n: number }>();
    for (const t of txs) {
      const raw = (t.category ?? "").trim();
      if (raw.length === 0) continue;
      const nk = normalizeCategoryKey(raw);
      const cid = keyToCategoryId.get(nk);
      let covered = false;
      if (cid) {
        for (const li of lineItems) {
          if (li.categoryId === cid) {
            covered = true;
            break;
          }
          if (li.categoryGroupId) {
            const cat = categories.find((c) => c._id === cid);
            if (cat && cat.groupId === li.categoryGroupId) {
              if (!dedicatedCategoryIds.has(cid)) covered = true;
            }
          }
        }
      }
      if (covered) continue;
      const exp = expenseLikeCents(t);
      if (exp === 0) continue;
      const cur = unbudgetedMap.get(nk) ?? { cents: 0, n: 0 };
      cur.cents += exp;
      cur.n += 1;
      unbudgetedMap.set(nk, cur);
    }

    let unbudgetedSpendCents = 0;
    const unbudgetedCategories = [...unbudgetedMap.entries()].map(
      ([key, v]) => {
        unbudgetedSpendCents += v.cents;
        return {
          category: key,
          actualCents: v.cents,
          transactionCount: v.n,
        };
      },
    );

    const projectedSavingsCents = Math.max(
      0,
      budget.monthlyIncomeCents - totalBudgeted,
    );

    return {
      month: args.month,
      budgetId: budget._id,
      monthlyIncomeCents: budget.monthlyIncomeCents,
      lineItems: details,
      projectedSavingsCents,
      unbudgetedSpendCents,
      unbudgetedCategories: unbudgetedCategories.sort(
        (a, b) => b.actualCents - a.actualCents,
      ),
      paceContext: {
        asOfDate: asOf,
        dayOfMonth,
        daysInMonth,
      },
    };
  },
});

const trendPointValidator = v.object({
  month: v.string(),
  lineItemId: v.id("budgetLineItems"),
  targetName: v.string(),
  budgetedCents: v.number(),
  actualCents: v.number(),
});

export const budgetTrendHistory = query({
  args: {
    budgetId: v.optional(v.id("budgets")),
    months: v.optional(v.number()),
  },
  returns: v.array(trendPointValidator),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const budget = await resolveBudget(ctx, args.budgetId);
    if (!budget) throw new Error("No budget found");

    const nMonths = Math.min(Math.max(args.months ?? 6, 2), 24);
    const latest = await latestIncurredDate(ctx);
    if (!latest) return [];

    const endMonth = latest.slice(0, 7);

    const lineItems = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_budget_sort", (q) => q.eq("budgetId", budget._id))
      .collect();

    const categories = await ctx.db.query("categories").collect();
    const dedicatedCategoryIds = new Set<Id<"categories">>();
    for (const li of lineItems) {
      if (li.categoryId) dedicatedCategoryIds.add(li.categoryId);
    }

    const out: {
      month: string;
      lineItemId: Id<"budgetLineItems">;
      targetName: string;
      budgetedCents: number;
      actualCents: number;
    }[] = [];

    for (let i = nMonths - 1; i >= 0; i -= 1) {
      const month = addMonthsYYYYMM(endMonth, -i);
      const { startDate, endDate } = monthBounds(month);
      const txs = await loadTransactionsInRange(ctx, { startDate, endDate });

      function actualForCategory(catId: Id<"categories">): number {
        const cat = categories.find((c) => c._id === catId);
        if (!cat) return 0;
        const nk = cat.normalizedKey;
        let sum = 0;
        for (const t of txs) {
          const raw = (t.category ?? "").trim();
          if (raw.length === 0) continue;
          if (normalizeCategoryKey(raw) !== nk) continue;
          sum += expenseLikeCents(t);
        }
        return sum;
      }

      function actualForGroup(groupId: Id<"categoryGroups">): number {
        const catsInGroup = categories.filter((c) => c.groupId === groupId);
        let sum = 0;
        for (const c of catsInGroup) {
          if (dedicatedCategoryIds.has(c._id)) continue;
          sum += actualForCategory(c._id);
        }
        return sum;
      }

      for (const li of lineItems) {
        const monthlyLimit = effectiveMonthlyLimitCents({
          limitCents: li.limitCents,
          cadence: li.cadence,
        });
        const actual = li.categoryId
          ? actualForCategory(li.categoryId)
          : li.categoryGroupId
            ? actualForGroup(li.categoryGroupId)
            : 0;

        let targetName = "Budget line";
        if (li.categoryId) {
          const c = categories.find((x) => x._id === li.categoryId);
          targetName = c?.name ?? targetName;
        } else if (li.categoryGroupId) {
          const g = await ctx.db.get(li.categoryGroupId);
          targetName = g?.name ?? targetName;
        }

        out.push({
          month,
          lineItemId: li._id,
          targetName,
          budgetedCents: monthlyLimit,
          actualCents: actual,
        });
      }
    }

    return out;
  },
});
