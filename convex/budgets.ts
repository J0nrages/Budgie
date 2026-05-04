import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { normalizeCategoryKey } from "./lib/categories";

const budgetDocValidator = v.object({
  _id: v.id("budgets"),
  _creationTime: v.number(),
  name: v.string(),
  isActive: v.boolean(),
  monthlyIncomeCents: v.number(),
  effectiveFrom: v.string(),
  effectiveTo: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const lineItemDocValidator = v.object({
  _id: v.id("budgetLineItems"),
  _creationTime: v.number(),
  budgetId: v.id("budgets"),
  categoryId: v.optional(v.id("categories")),
  categoryGroupId: v.optional(v.id("categoryGroups")),
  targetType: v.union(
    v.literal("spending"),
    v.literal("savingsBalance"),
    v.literal("monthlyBuilder"),
  ),
  limitCents: v.number(),
  cadence: v.union(
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("yearly"),
    v.literal("byDate"),
  ),
  cadenceDayOfWeek: v.optional(v.number()),
  cadenceDayOfMonth: v.optional(v.number()),
  targetDate: v.optional(v.string()),
  refillBehavior: v.union(v.literal("setAside"), v.literal("refillUpTo")),
  rolloverUnused: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function assertIsoMonth(label: string, value: string): void {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM`);
  }
}

function assertLineItemTarget(
  categoryId: Id<"categories"> | undefined,
  categoryGroupId: Id<"categoryGroups"> | undefined,
): void {
  const hasCat = categoryId !== undefined;
  const hasGroup = categoryGroupId !== undefined;
  if (hasCat === hasGroup) {
    throw new Error("Set exactly one of categoryId or categoryGroupId");
  }
}

export const list = query({
  args: {},
  returns: v.array(budgetDocValidator),
  handler: async (ctx): Promise<Doc<"budgets">[]> => {
    assertSingleUserLocalMode();
    return await ctx.db.query("budgets").collect();
  },
});

const budgetWithLineItemsValidator = v.object({
  budget: budgetDocValidator,
  lineItems: v.array(lineItemDocValidator),
});

export const getActive = query({
  args: {},
  returns: v.union(budgetWithLineItemsValidator, v.null()),
  handler: async (
    ctx,
  ): Promise<{ budget: Doc<"budgets">; lineItems: Doc<"budgetLineItems">[] } | null> => {
    assertSingleUserLocalMode();
    const active = await ctx.db
      .query("budgets")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();
    if (!active) return null;
    const lineItems = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_budget_sort", (q) => q.eq("budgetId", active._id))
      .collect();
    lineItems.sort((a, b) => a.sortOrder - b.sortOrder);
    return { budget: active, lineItems };
  },
});

export const getWithLineItems = query({
  args: { budgetId: v.id("budgets") },
  returns: v.union(budgetWithLineItemsValidator, v.null()),
  handler: async (
    ctx,
    args,
  ): Promise<{ budget: Doc<"budgets">; lineItems: Doc<"budgetLineItems">[] } | null> => {
    assertSingleUserLocalMode();
    const budget = await ctx.db.get(args.budgetId);
    if (!budget) return null;
    const lineItems = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_budget_sort", (q) => q.eq("budgetId", args.budgetId))
      .collect();
    lineItems.sort((a, b) => a.sortOrder - b.sortOrder);
    return { budget, lineItems };
  },
});

const historicalAvgRowValidator = v.object({
  categoryId: v.optional(v.id("categories")),
  category: v.string(),
  averageCents: v.number(),
  monthCount: v.number(),
});

export const historicalAverages = query({
  args: { months: v.optional(v.number()) },
  returns: v.array(historicalAvgRowValidator),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const monthsBack = Math.min(Math.max(args.months ?? 6, 1), 36);

    const txs = await ctx.db.query("transactions").collect();
    const monthTotals = new Map<string, Map<string, { label: string; cents: number }>>();

    const today = new Date();
    const cutoff = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1),
    );
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    for (const t of txs) {
      if (t.incurredDate < cutoffIso) continue;
      const month = t.incurredDate.slice(0, 7);
      const raw = (t.category ?? "").trim();
      const key = raw.length > 0 ? normalizeCategoryKey(raw) : "(uncategorized)";
      if (!monthTotals.has(month)) monthTotals.set(month, new Map());
      const m = monthTotals.get(month)!;
      let delta = 0;
      if (t.type === "expense" || t.type === "fee" || t.type === "interest") {
        delta = t.amountCents;
      } else if (t.type === "income" || t.type === "payment") {
        delta = -t.amountCents;
      }
      const cur = m.get(key) ?? { label: key === "(uncategorized)" ? "(uncategorized)" : raw, cents: 0 };
      cur.cents += delta;
      if (raw.length > 0) cur.label = raw;
      m.set(key, cur);
    }

    const keysSeen = new Set<string>();
    for (const [, map] of monthTotals) {
      for (const k of map.keys()) keysSeen.add(k);
    }

    const categories = await ctx.db.query("categories").collect();
    const keyToCategoryId = new Map<string, Id<"categories">>();
    for (const c of categories) {
      keyToCategoryId.set(c.normalizedKey, c._id);
    }

    const rows: {
      categoryId?: Id<"categories">;
      category: string;
      averageCents: number;
      monthCount: number;
    }[] = [];

    const monthCount = monthTotals.size;

    for (const key of keysSeen) {
      let sum = 0;
      let monthsWithData = 0;
      let label = key;
      for (const [, map] of monthTotals) {
        const entry = map.get(key);
        if (entry) {
          sum += Math.abs(entry.cents);
          monthsWithData += 1;
          label = entry.label;
        }
      }
      const avg =
        monthCount > 0 ? Math.round(sum / Math.max(monthsWithData, 1)) : 0;
      rows.push({
        categoryId: keyToCategoryId.get(key),
        category: label,
        averageCents: avg,
        monthCount,
      });
    }

    return rows.sort((a, b) => Math.abs(b.averageCents) - Math.abs(a.averageCents));
  },
});

const createLineItemInputValidator = v.object({
  categoryId: v.optional(v.id("categories")),
  categoryGroupId: v.optional(v.id("categoryGroups")),
  targetType: v.union(
    v.literal("spending"),
    v.literal("savingsBalance"),
    v.literal("monthlyBuilder"),
  ),
  limitCents: v.number(),
  cadence: v.union(
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("yearly"),
    v.literal("byDate"),
  ),
  cadenceDayOfWeek: v.optional(v.number()),
  cadenceDayOfMonth: v.optional(v.number()),
  targetDate: v.optional(v.string()),
  refillBehavior: v.union(v.literal("setAside"), v.literal("refillUpTo")),
  rolloverUnused: v.boolean(),
  sortOrder: v.optional(v.number()),
});

export const create = mutation({
  args: {
    name: v.string(),
    monthlyIncomeCents: v.number(),
    effectiveFrom: v.string(),
    lineItems: v.optional(v.array(createLineItemInputValidator)),
  },
  returns: v.id("budgets"),
  handler: async (ctx, args): Promise<Id<"budgets">> => {
    assertSingleUserLocalMode();
    assertIsoMonth("effectiveFrom", args.effectiveFrom);
    const name = args.name.trim();
    if (name.length === 0) throw new Error("Budget name is required");
    if (!Number.isFinite(args.monthlyIncomeCents) || args.monthlyIncomeCents < 0) {
      throw new Error("monthlyIncomeCents must be >= 0");
    }

    const now = Date.now();
    const budgetId = await ctx.db.insert("budgets", {
      name,
      isActive: false,
      monthlyIncomeCents: args.monthlyIncomeCents,
      effectiveFrom: args.effectiveFrom,
      effectiveTo: undefined,
      createdAt: now,
      updatedAt: now,
    });

    const items = args.lineItems ?? [];
    for (let i = 0; i < items.length; i += 1) {
      const li = items[i];
      assertLineItemTarget(li.categoryId, li.categoryGroupId);
      if (!Number.isFinite(li.limitCents) || li.limitCents < 0) {
        throw new Error("limitCents must be >= 0");
      }
      await ctx.db.insert("budgetLineItems", {
        budgetId,
        categoryId: li.categoryId,
        categoryGroupId: li.categoryGroupId,
        targetType: li.targetType,
        limitCents: li.limitCents,
        cadence: li.cadence,
        cadenceDayOfWeek: li.cadenceDayOfWeek,
        cadenceDayOfMonth: li.cadenceDayOfMonth,
        targetDate: li.targetDate,
        refillBehavior: li.refillBehavior,
        rolloverUnused: li.rolloverUnused,
        sortOrder: li.sortOrder ?? i,
        createdAt: now,
        updatedAt: now,
      });
    }

    return budgetId;
  },
});

export const update = mutation({
  args: {
    budgetId: v.id("budgets"),
    name: v.optional(v.string()),
    monthlyIncomeCents: v.optional(v.number()),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.budgetId);
    if (!doc) throw new Error("Budget not found");
    const patch: Partial<Doc<"budgets">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const n = args.name.trim();
      if (n.length === 0) throw new Error("Budget name is required");
      patch.name = n;
    }
    if (args.monthlyIncomeCents !== undefined) {
      if (!Number.isFinite(args.monthlyIncomeCents) || args.monthlyIncomeCents < 0) {
        throw new Error("monthlyIncomeCents must be >= 0");
      }
      patch.monthlyIncomeCents = args.monthlyIncomeCents;
    }
    if (args.effectiveFrom !== undefined) {
      assertIsoMonth("effectiveFrom", args.effectiveFrom);
      patch.effectiveFrom = args.effectiveFrom;
    }
    if (args.effectiveTo !== undefined) {
      if (args.effectiveTo.trim().length === 0) {
        patch.effectiveTo = undefined;
      } else {
        assertIsoMonth("effectiveTo", args.effectiveTo);
        patch.effectiveTo = args.effectiveTo;
      }
    }
    await ctx.db.patch(args.budgetId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { budgetId: v.id("budgets") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.budgetId);
    if (!doc) throw new Error("Budget not found");
    if (doc.isActive) {
      throw new Error("Deactivate this budget before deleting it");
    }

    const scenarios = await ctx.db
      .query("budgetScenarios")
      .withIndex("by_baseBudget", (q) => q.eq("baseBudgetId", args.budgetId))
      .first();
    if (scenarios) {
      throw new Error("Remove scenarios that reference this budget first");
    }

    const lines = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_budget", (q) => q.eq("budgetId", args.budgetId))
      .collect();
    for (const line of lines) {
      await ctx.db.delete(line._id);
    }
    await ctx.db.delete(args.budgetId);
    return null;
  },
});

export const setActive = mutation({
  args: { budgetId: v.id("budgets") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const target = await ctx.db.get(args.budgetId);
    if (!target) throw new Error("Budget not found");

    const all = await ctx.db.query("budgets").collect();
    const now = Date.now();
    for (const b of all) {
      await ctx.db.patch(b._id, {
        isActive: b._id === args.budgetId,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const createLineItem = mutation({
  args: {
    budgetId: v.id("budgets"),
    categoryId: v.optional(v.id("categories")),
    categoryGroupId: v.optional(v.id("categoryGroups")),
    targetType: v.union(
      v.literal("spending"),
      v.literal("savingsBalance"),
      v.literal("monthlyBuilder"),
    ),
    limitCents: v.number(),
    cadence: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("yearly"),
      v.literal("byDate"),
    ),
    cadenceDayOfWeek: v.optional(v.number()),
    cadenceDayOfMonth: v.optional(v.number()),
    targetDate: v.optional(v.string()),
    refillBehavior: v.union(v.literal("setAside"), v.literal("refillUpTo")),
    rolloverUnused: v.boolean(),
    sortOrder: v.optional(v.number()),
  },
  returns: v.id("budgetLineItems"),
  handler: async (ctx, args): Promise<Id<"budgetLineItems">> => {
    assertSingleUserLocalMode();
    assertLineItemTarget(args.categoryId, args.categoryGroupId);
    const budget = await ctx.db.get(args.budgetId);
    if (!budget) throw new Error("Budget not found");
    if (!Number.isFinite(args.limitCents) || args.limitCents < 0) {
      throw new Error("limitCents must be >= 0");
    }

    const existing = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_budget_sort", (q) => q.eq("budgetId", args.budgetId))
      .collect();
    const sortOrder =
      args.sortOrder ??
      existing.reduce((m, li) => Math.max(m, li.sortOrder), -1) + 1;

    const now = Date.now();
    return await ctx.db.insert("budgetLineItems", {
      budgetId: args.budgetId,
      categoryId: args.categoryId,
      categoryGroupId: args.categoryGroupId,
      targetType: args.targetType,
      limitCents: args.limitCents,
      cadence: args.cadence,
      cadenceDayOfWeek: args.cadenceDayOfWeek,
      cadenceDayOfMonth: args.cadenceDayOfMonth,
      targetDate: args.targetDate,
      refillBehavior: args.refillBehavior,
      rolloverUnused: args.rolloverUnused,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateLineItem = mutation({
  args: {
    lineItemId: v.id("budgetLineItems"),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    categoryGroupId: v.optional(v.union(v.id("categoryGroups"), v.null())),
    targetType: v.optional(
      v.union(
        v.literal("spending"),
        v.literal("savingsBalance"),
        v.literal("monthlyBuilder"),
      ),
    ),
    limitCents: v.optional(v.number()),
    cadence: v.optional(
      v.union(
        v.literal("weekly"),
        v.literal("monthly"),
        v.literal("yearly"),
        v.literal("byDate"),
      ),
    ),
    cadenceDayOfWeek: v.optional(v.union(v.number(), v.null())),
    cadenceDayOfMonth: v.optional(v.union(v.number(), v.null())),
    targetDate: v.optional(v.union(v.string(), v.null())),
    refillBehavior: v.optional(
      v.union(v.literal("setAside"), v.literal("refillUpTo")),
    ),
    rolloverUnused: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.lineItemId);
    if (!doc) throw new Error("Line item not found");

    let categoryId = doc.categoryId;
    let categoryGroupId = doc.categoryGroupId;
    if (args.categoryId !== undefined) {
      categoryId = args.categoryId === null ? undefined : args.categoryId;
    }
    if (args.categoryGroupId !== undefined) {
      categoryGroupId =
        args.categoryGroupId === null ? undefined : args.categoryGroupId;
    }
    assertLineItemTarget(categoryId, categoryGroupId);

    const patch: Partial<Doc<"budgetLineItems">> = { updatedAt: Date.now() };
    patch.categoryId = categoryId;
    patch.categoryGroupId = categoryGroupId;
    if (args.targetType !== undefined) patch.targetType = args.targetType;
    if (args.limitCents !== undefined) {
      if (!Number.isFinite(args.limitCents) || args.limitCents < 0) {
        throw new Error("limitCents must be >= 0");
      }
      patch.limitCents = args.limitCents;
    }
    if (args.cadence !== undefined) patch.cadence = args.cadence;
    if (args.cadenceDayOfWeek !== undefined) {
      patch.cadenceDayOfWeek =
        args.cadenceDayOfWeek === null ? undefined : args.cadenceDayOfWeek;
    }
    if (args.cadenceDayOfMonth !== undefined) {
      patch.cadenceDayOfMonth =
        args.cadenceDayOfMonth === null ? undefined : args.cadenceDayOfMonth;
    }
    if (args.targetDate !== undefined) {
      patch.targetDate = args.targetDate === null ? undefined : args.targetDate;
    }
    if (args.refillBehavior !== undefined) patch.refillBehavior = args.refillBehavior;
    if (args.rolloverUnused !== undefined) patch.rolloverUnused = args.rolloverUnused;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;

    await ctx.db.patch(args.lineItemId, patch);
    return null;
  },
});

export const removeLineItem = mutation({
  args: { lineItemId: v.id("budgetLineItems") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.lineItemId);
    if (!doc) throw new Error("Line item not found");

    const scenarios = await ctx.db.query("budgetScenarios").collect();
    for (const s of scenarios) {
      if (s.lineItemOverrides.some((o) => o.lineItemId === args.lineItemId)) {
        throw new Error(
          "Remove or edit scenarios that reference this line item first",
        );
      }
    }

    await ctx.db.delete(args.lineItemId);
    return null;
  },
});

export const reorderLineItems = mutation({
  args: {
    budgetId: v.id("budgets"),
    orderedLineItemIds: v.array(v.id("budgetLineItems")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const now = Date.now();
    for (let i = 0; i < args.orderedLineItemIds.length; i += 1) {
      const id = args.orderedLineItemIds[i];
      const doc = await ctx.db.get(id);
      if (!doc) throw new Error("Line item not found");
      if (doc.budgetId !== args.budgetId) {
        throw new Error("Line item belongs to a different budget");
      }
      await ctx.db.patch(id, { sortOrder: i, updatedAt: now });
    }
    return null;
  },
});
