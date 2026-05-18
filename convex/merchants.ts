import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { normalizedMerchantKey } from "./lib/merchantKey";
import { normalizeLogoDomain } from "../src/lib/logo-dev";

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

export const setMerchantLogoDomain = mutation({
  args: {
    merchantId: v.id("merchants"),
    /** Pass `null` or empty string after trim to clear. */
    logoDomain: v.union(v.string(), v.null()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    assertSingleUserLocalMode();
    const merchant = await ctx.db.get(args.merchantId);
    if (!merchant) throw new Error("Merchant not found");
    const now = Date.now();
    if (args.logoDomain === null || args.logoDomain.trim().length === 0) {
      await ctx.db.patch(args.merchantId, { logoDomain: undefined, updatedAt: now });
      return null;
    }
    const normalized = normalizeLogoDomain(args.logoDomain);
    if (!normalized) {
      throw new Error(
        "Invalid logo domain: use a hostname only (e.g. wholefoodsmarket.com or https://shopify.com)",
      );
    }
    await ctx.db.patch(args.merchantId, { logoDomain: normalized, updatedAt: now });
    return normalized;
  },
});

/**
 * Atomically merge several merchants into one canonical merchant.
 *
 * For every transaction referencing a merged merchant id, switch its
 * `merchantId` to the keep merchant and rewrite its `merchantName` to
 * the keep merchant's canonical name. Aliases on merged merchants get
 * reassigned to the keep merchant (pattern collisions skipped). The
 * merged merchant documents are then deleted.
 *
 * Returns a snapshot the caller can persist as `undoData` for
 * `aiActions.undo` to fully reverse the merge later.
 */
export const merge = mutation({
  args: {
    keepMerchantId: v.id("merchants"),
    mergeMerchantIds: v.array(v.id("merchants")),
  },
  returns: v.object({
    keepMerchantId: v.id("merchants"),
    keepCanonicalName: v.string(),
    affectedTransactionCount: v.number(),
    reassignedAliasCount: v.number(),
    deletedMerchantIds: v.array(v.id("merchants")),
    undoSnapshot: v.any(),
  }),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const keep = await ctx.db.get(args.keepMerchantId);
    if (!keep) throw new Error("Keep merchant not found");

    const uniqueMergeIds = [...new Set(args.mergeMerchantIds)].filter(
      (id) => id !== args.keepMerchantId,
    );
    if (uniqueMergeIds.length === 0) {
      return {
        keepMerchantId: args.keepMerchantId,
        keepCanonicalName: keep.canonicalName,
        affectedTransactionCount: 0,
        reassignedAliasCount: 0,
        deletedMerchantIds: [],
        undoSnapshot: { transactions: [], restoredMerchants: [] },
      };
    }

    const transactionsSnapshot: Array<{
      id: Id<"transactions">;
      merchantId?: Id<"merchants">;
      merchantName?: string;
    }> = [];
    const restoredMerchants: Array<{
      doc: {
        canonicalName: string;
        normalizedKey: string;
        logoDomain?: string;
        createdAt: number;
        updatedAt: number;
      };
      aliases: Array<{
        aliasPattern: string;
        createdAt: number;
        updatedAt: number;
      }>;
    }> = [];

    let affectedTransactionCount = 0;
    let reassignedAliasCount = 0;
    const now = Date.now();

    for (const mergeId of uniqueMergeIds) {
      const mergeDoc = await ctx.db.get(mergeId);
      if (!mergeDoc) continue;

      const aliases = await ctx.db
        .query("merchantAliases")
        .withIndex("by_merchant", (q) => q.eq("merchantId", mergeId))
        .collect();

      restoredMerchants.push({
        doc: {
          canonicalName: mergeDoc.canonicalName,
          normalizedKey: mergeDoc.normalizedKey,
          logoDomain: mergeDoc.logoDomain,
          createdAt: mergeDoc.createdAt,
          updatedAt: mergeDoc.updatedAt,
        },
        aliases: aliases.map((a) => ({
          aliasPattern: a.aliasPattern,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
      });

      for (const alias of aliases) {
        const clash = await ctx.db
          .query("merchantAliases")
          .withIndex("by_alias_pattern", (q) =>
            q.eq("aliasPattern", alias.aliasPattern),
          )
          .first();
        if (clash && clash.merchantId === args.keepMerchantId) {
          await ctx.db.delete(alias._id);
        } else if (clash && clash._id !== alias._id) {
          await ctx.db.delete(alias._id);
        } else {
          await ctx.db.patch(alias._id, {
            merchantId: args.keepMerchantId,
            updatedAt: now,
          });
          reassignedAliasCount += 1;
        }
      }

      const txs = await ctx.db
        .query("transactions")
        .filter((q) => q.eq(q.field("merchantId"), mergeId))
        .collect();
      for (const t of txs) {
        transactionsSnapshot.push({
          id: t._id,
          merchantId: t.merchantId,
          merchantName: t.merchantName,
        });
        await ctx.db.patch(t._id, {
          merchantId: args.keepMerchantId,
          merchantName: keep.canonicalName,
          updatedAt: now,
        });
        affectedTransactionCount += 1;
      }

      await ctx.db.delete(mergeId);
    }

    return {
      keepMerchantId: args.keepMerchantId,
      keepCanonicalName: keep.canonicalName,
      affectedTransactionCount,
      reassignedAliasCount,
      deletedMerchantIds: uniqueMergeIds,
      undoSnapshot: {
        transactions: transactionsSnapshot,
        restoredMerchants,
      },
    };
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
