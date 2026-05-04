import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { normalizedMerchantKey } from "./lib/merchantKey";

export const listMerchants = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Doc<"merchants">[]> => {
    assertSingleUserLocalMode();
    const limit = Math.min(args.limit ?? 500, 2000);
    const all = await ctx.db.query("merchants").collect();
    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  },
});

export const listMerchantAliases = query({
  args: { merchantId: v.optional(v.id("merchants")) },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Doc<"merchantAliases">[]> => {
    assertSingleUserLocalMode();
    if (args.merchantId) {
      return await ctx.db
        .query("merchantAliases")
        .withIndex("by_merchant", (q) => q.eq("merchantId", args.merchantId!))
        .collect();
    }
    return await ctx.db.query("merchantAliases").take(500);
  },
});

export const createMerchant = mutation({
  args: { canonicalName: v.string() },
  returns: v.id("merchants"),
  handler: async (ctx, args): Promise<Id<"merchants">> => {
    assertSingleUserLocalMode();
    const canonicalName = args.canonicalName.trim();
    if (canonicalName.length === 0) throw new Error("Merchant name is required");
    const normalizedKey = normalizedMerchantKey(canonicalName);
    const existing = await ctx.db
      .query("merchants")
      .withIndex("by_normalized_key", (q) => q.eq("normalizedKey", normalizedKey))
      .first();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("merchants", {
      canonicalName,
      normalizedKey,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertMerchantAlias = mutation({
  args: {
    merchantId: v.id("merchants"),
    aliasPattern: v.string(),
  },
  returns: v.id("merchantAliases"),
  handler: async (ctx, args): Promise<Id<"merchantAliases">> => {
    assertSingleUserLocalMode();
    const pattern = normalizedMerchantKey(args.aliasPattern);
    if (pattern.length === 0) throw new Error("Alias pattern is required");
    const merchant = await ctx.db.get(args.merchantId);
    if (!merchant) throw new Error("Merchant not found");

    const existing = await ctx.db
      .query("merchantAliases")
      .withIndex("by_alias_pattern", (q) => q.eq("aliasPattern", pattern))
      .first();
    const now = Date.now();
    if (existing) {
      if (existing.merchantId !== args.merchantId) {
        throw new Error("This alias pattern is already mapped to another merchant");
      }
      await ctx.db.patch(existing._id, { updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("merchantAliases", {
      merchantId: args.merchantId,
      aliasPattern: pattern,
      createdAt: now,
      updatedAt: now,
    });
  },
});
