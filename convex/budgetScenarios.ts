import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { effectiveMonthlyLimitCents } from "./lib/budgetMath";

const scenarioDocValidator = v.object({
  _id: v.id("budgetScenarios"),
  _creationTime: v.number(),
  name: v.string(),
  baseBudgetId: v.id("budgets"),
  scenarioType: v.union(v.literal("budgetTweak"), v.literal("lifeChange")),
  lineItemOverrides: v.array(
    v.object({
      lineItemId: v.id("budgetLineItems"),
      limitCents: v.number(),
    }),
  ),
  incomeOverrideCents: v.optional(v.number()),
  additionalExpensesCents: v.optional(v.number()),
  removedExpensesCents: v.optional(v.number()),
  monthsToProject: v.number(),
  startMonth: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const projectionPointValidator = v.object({
  month: v.string(),
  baselineBalanceCents: v.number(),
  scenarioBalanceCents: v.number(),
});

function addMonthsYYYYMM(monthYYYYMM: string, delta: number): string {
  const [yS, mS] = monthYYYYMM.split("-");
  const y = Number(yS);
  const m = Number(mS);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export const list = query({
  args: { baseBudgetId: v.optional(v.id("budgets")) },
  returns: v.array(scenarioDocValidator),
  handler: async (ctx, args): Promise<Doc<"budgetScenarios">[]> => {
    assertSingleUserLocalMode();
    if (args.baseBudgetId) {
      return await ctx.db
        .query("budgetScenarios")
        .withIndex("by_baseBudget", (q) =>
          q.eq("baseBudgetId", args.baseBudgetId!),
        )
        .collect();
    }
    return await ctx.db.query("budgetScenarios").collect();
  },
});

export const get = query({
  args: { scenarioId: v.id("budgetScenarios") },
  returns: v.union(scenarioDocValidator, v.null()),
  handler: async (ctx, args): Promise<Doc<"budgetScenarios"> | null> => {
    assertSingleUserLocalMode();
    return await ctx.db.get(args.scenarioId);
  },
});

export const getWithProjection = query({
  args: { scenarioId: v.id("budgetScenarios") },
  returns: v.object({
    scenario: scenarioDocValidator,
    points: v.array(projectionPointValidator),
    breakEvenMonth: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) throw new Error("Scenario not found");

    const budget = await ctx.db.get(scenario.baseBudgetId);
    if (!budget) throw new Error("Base budget not found");

    const lineItems = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_budget_sort", (q) => q.eq("budgetId", scenario.baseBudgetId))
      .collect();

    const overrideMap = new Map(
      scenario.lineItemOverrides.map((o) => [o.lineItemId, o.limitCents]),
    );

    function totalMonthlyBudgeted(
      items: Doc<"budgetLineItems">[],
      overrides: Map<Id<"budgetLineItems">, number>,
    ): number {
      let sum = 0;
      for (const li of items) {
        const lim = overrides.get(li._id) ?? li.limitCents;
        sum += effectiveMonthlyLimitCents({
          limitCents: lim,
          cadence: li.cadence,
        });
      }
      return sum;
    }

    const baselineSpend = totalMonthlyBudgeted(lineItems, new Map());
    const scenarioOverrides = new Map<Id<"budgetLineItems">, number>();
    for (const li of lineItems) {
      const o = overrideMap.get(li._id);
      if (o !== undefined) scenarioOverrides.set(li._id, o);
    }
    const scenarioSpend = totalMonthlyBudgeted(lineItems, scenarioOverrides);

    const months = Math.min(Math.max(scenario.monthsToProject, 1), 24);
    const incomeB = budget.monthlyIncomeCents;
    let incomeS = scenario.incomeOverrideCents ?? incomeB;
    if (scenario.scenarioType === "lifeChange") {
      incomeS = scenario.incomeOverrideCents ?? incomeB;
    } else {
      incomeS = incomeB;
    }

    const lifeDelta =
      scenario.scenarioType === "lifeChange"
        ? (scenario.removedExpensesCents ?? 0) -
          (scenario.additionalExpensesCents ?? 0)
        : 0;

    const points: {
      month: string;
      baselineBalanceCents: number;
      scenarioBalanceCents: number;
    }[] = [];

    let baseBal = 0;
    let scenBal = 0;
    let breakEvenMonth: string | undefined;

    for (let i = 0; i < months; i += 1) {
      const month = addMonthsYYYYMM(scenario.startMonth, i);
      baseBal += incomeB - baselineSpend;
      scenBal +=
        incomeS - scenarioSpend + (scenario.scenarioType === "lifeChange" ? lifeDelta : 0);
      points.push({
        month,
        baselineBalanceCents: baseBal,
        scenarioBalanceCents: scenBal,
      });
      if (
        breakEvenMonth === undefined &&
        scenBal < 0 &&
        i > 0 &&
        points[i - 1]!.scenarioBalanceCents >= 0
      ) {
        breakEvenMonth = month;
      }
    }

    return {
      scenario,
      points,
      breakEvenMonth,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    baseBudgetId: v.id("budgets"),
    scenarioType: v.union(v.literal("budgetTweak"), v.literal("lifeChange")),
    lineItemOverrides: v.array(
      v.object({
        lineItemId: v.id("budgetLineItems"),
        limitCents: v.number(),
      }),
    ),
    incomeOverrideCents: v.optional(v.number()),
    additionalExpensesCents: v.optional(v.number()),
    removedExpensesCents: v.optional(v.number()),
    monthsToProject: v.number(),
    startMonth: v.string(),
  },
  returns: v.id("budgetScenarios"),
  handler: async (ctx, args): Promise<Id<"budgetScenarios">> => {
    assertSingleUserLocalMode();
    const base = await ctx.db.get(args.baseBudgetId);
    if (!base) throw new Error("Base budget not found");
    if (!/^\d{4}-\d{2}$/.test(args.startMonth)) {
      throw new Error("startMonth must be YYYY-MM");
    }
    const name = args.name.trim();
    if (name.length === 0) throw new Error("Name is required");
    const months = Math.min(Math.max(args.monthsToProject, 1), 24);

    const now = Date.now();
    return await ctx.db.insert("budgetScenarios", {
      name,
      baseBudgetId: args.baseBudgetId,
      scenarioType: args.scenarioType,
      lineItemOverrides: args.lineItemOverrides,
      incomeOverrideCents: args.incomeOverrideCents,
      additionalExpensesCents: args.additionalExpensesCents,
      removedExpensesCents: args.removedExpensesCents,
      monthsToProject: months,
      startMonth: args.startMonth,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    scenarioId: v.id("budgetScenarios"),
    name: v.optional(v.string()),
    lineItemOverrides: v.optional(
      v.array(
        v.object({
          lineItemId: v.id("budgetLineItems"),
          limitCents: v.number(),
        }),
      ),
    ),
    incomeOverrideCents: v.optional(v.number()),
    additionalExpensesCents: v.optional(v.number()),
    removedExpensesCents: v.optional(v.number()),
    monthsToProject: v.optional(v.number()),
    startMonth: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.scenarioId);
    if (!doc) throw new Error("Scenario not found");
    const patch: Partial<Doc<"budgetScenarios">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const n = args.name.trim();
      if (n.length === 0) throw new Error("Name is required");
      patch.name = n;
    }
    if (args.lineItemOverrides !== undefined) {
      patch.lineItemOverrides = args.lineItemOverrides;
    }
    if (args.incomeOverrideCents !== undefined) {
      patch.incomeOverrideCents = args.incomeOverrideCents;
    }
    if (args.additionalExpensesCents !== undefined) {
      patch.additionalExpensesCents = args.additionalExpensesCents;
    }
    if (args.removedExpensesCents !== undefined) {
      patch.removedExpensesCents = args.removedExpensesCents;
    }
    if (args.monthsToProject !== undefined) {
      patch.monthsToProject = Math.min(Math.max(args.monthsToProject, 1), 24);
    }
    if (args.startMonth !== undefined) {
      if (!/^\d{4}-\d{2}$/.test(args.startMonth)) {
        throw new Error("startMonth must be YYYY-MM");
      }
      patch.startMonth = args.startMonth;
    }
    await ctx.db.patch(args.scenarioId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { scenarioId: v.id("budgetScenarios") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.scenarioId);
    if (!doc) throw new Error("Scenario not found");
    await ctx.db.delete(args.scenarioId);
    return null;
  },
});
