import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { assertIsoDate } from "./lib/datesIso";

const categoryRowValidator = v.object({
  category: v.string(),
  totalCents: v.number(),
  count: v.number(),
});

const merchantRowValidator = v.object({
  merchantName: v.string(),
  totalCents: v.number(),
  count: v.number(),
});

async function loadTransactionsInRange(
  ctx: QueryCtx,
  args: {
    startDate: string;
    endDate: string;
    accountId?: Id<"accounts">;
  },
): Promise<Doc<"transactions">[]> {
  if (args.accountId) {
    return await ctx.db
      .query("transactions")
      .withIndex("by_account_incurred", (q) =>
        q
          .eq("accountId", args.accountId)
          .gte("incurredDate", args.startDate)
          .lte("incurredDate", args.endDate),
      )
      .collect();
  }
  return await ctx.db
    .query("transactions")
    .withIndex("by_incurredDate", (q) =>
      q.gte("incurredDate", args.startDate).lte("incurredDate", args.endDate),
    )
    .collect();
}

export const categoryTotalsInRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    accountId: v.optional(v.id("accounts")),
  },
  returns: v.array(categoryRowValidator),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    assertIsoDate("startDate", args.startDate);
    assertIsoDate("endDate", args.endDate);

    const rows = await loadTransactionsInRange(ctx, {
      startDate: args.startDate,
      endDate: args.endDate,
      accountId: args.accountId,
    });

    const map = new Map<string, { totalCents: number; count: number }>();
    for (const t of rows) {
      if (t.type === "transfer") continue;
      const key = (t.category ?? "").trim() || "(uncategorized)";
      const cur = map.get(key) ?? { totalCents: 0, count: 0 };
      if (t.type === "expense" || t.type === "fee" || t.type === "interest") {
        cur.totalCents += t.amountCents;
      } else if (t.type === "income" || t.type === "payment") {
        cur.totalCents -= t.amountCents;
      }
      cur.count += 1;
      map.set(key, cur);
    }

    return [...map.entries()]
      .map(([category, { totalCents, count }]) => ({ category, totalCents, count }))
      .sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents));
  },
});

export const merchantTotalsInRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    accountId: v.optional(v.id("accounts")),
    limit: v.optional(v.number()),
  },
  returns: v.array(merchantRowValidator),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    assertIsoDate("startDate", args.startDate);
    assertIsoDate("endDate", args.endDate);
    const cap = Math.min(args.limit ?? 50, 200);

    const rows = await loadTransactionsInRange(ctx, {
      startDate: args.startDate,
      endDate: args.endDate,
      accountId: args.accountId,
    });

    const map = new Map<string, { totalCents: number; count: number }>();
    for (const t of rows) {
      if (t.type === "transfer") continue;
      const name = (t.merchantName ?? "").trim() || t.description.trim().slice(0, 80);
      const cur = map.get(name) ?? { totalCents: 0, count: 0 };
      if (t.type === "expense" || t.type === "fee" || t.type === "interest") {
        cur.totalCents += t.amountCents;
      } else if (t.type === "income" || t.type === "payment") {
        cur.totalCents -= t.amountCents;
      }
      cur.count += 1;
      map.set(name, cur);
    }

    return [...map.entries()]
      .map(([merchantName, { totalCents, count }]) => ({ merchantName, totalCents, count }))
      .sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
      .slice(0, cap);
  },
});
