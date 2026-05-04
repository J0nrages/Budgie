import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { normalizeCategoryKey } from "./lib/categories";

const categoryGroupDocValidator = v.object({
  _id: v.id("categoryGroups"),
  _creationTime: v.number(),
  name: v.string(),
  waterfallTier: v.union(
    v.literal("income"),
    v.literal("fixed"),
    v.literal("flexible"),
    v.literal("savings"),
  ),
  sortOrder: v.number(),
  icon: v.optional(v.string()),
  isSystem: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const categoryDocValidator = v.object({
  _id: v.id("categories"),
  _creationTime: v.number(),
  name: v.string(),
  groupId: v.id("categoryGroups"),
  normalizedKey: v.string(),
  icon: v.optional(v.string()),
  sortOrder: v.number(),
  isSystem: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function getOrCreateUncategorizedGroup(
  ctx: MutationCtx,
): Promise<Doc<"categoryGroups">> {
  const existing = await ctx.db
    .query("categoryGroups")
    .withIndex("by_name", (q) => q.eq("name", "Uncategorized"))
    .first();
  if (existing) return existing;
  const now = Date.now();
  const maxSort = await ctx.db
    .query("categoryGroups")
    .withIndex("by_tier_sort", (q) => q.eq("waterfallTier", "flexible"))
    .collect();
  const sortOrder =
    maxSort.reduce((m, g) => Math.max(m, g.sortOrder), -1) + 1;
  const id = await ctx.db.insert("categoryGroups", {
    name: "Uncategorized",
    waterfallTier: "flexible",
    sortOrder,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
  });
  const doc = await ctx.db.get(id);
  if (!doc) throw new Error("Failed to create Uncategorized group");
  return doc;
}

export const listGroups = query({
  args: {},
  returns: v.array(categoryGroupDocValidator),
  handler: async (ctx): Promise<Doc<"categoryGroups">[]> => {
    assertSingleUserLocalMode();
    const groups = await ctx.db.query("categoryGroups").collect();
    return groups.sort((a, b) => {
      if (a.waterfallTier !== b.waterfallTier) {
        const tierOrder = ["income", "fixed", "flexible", "savings"];
        return tierOrder.indexOf(a.waterfallTier) - tierOrder.indexOf(b.waterfallTier);
      }
      return a.sortOrder - b.sortOrder;
    });
  },
});

export const listByGroup = query({
  args: { groupId: v.id("categoryGroups") },
  returns: v.array(categoryDocValidator),
  handler: async (ctx, args): Promise<Doc<"categories">[]> => {
    assertSingleUserLocalMode();
    const rows = await ctx.db
      .query("categories")
      .withIndex("by_group_sort", (q) => q.eq("groupId", args.groupId))
      .collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const listAll = query({
  args: {},
  returns: v.object({
    groups: v.array(categoryGroupDocValidator),
    categories: v.array(categoryDocValidator),
  }),
  handler: async (ctx): Promise<{
    groups: Doc<"categoryGroups">[];
    categories: Doc<"categories">[];
  }> => {
    assertSingleUserLocalMode();
    const groups = await ctx.db.query("categoryGroups").collect();
    const categories = await ctx.db.query("categories").collect();
    groups.sort((a, b) => {
      if (a.waterfallTier !== b.waterfallTier) {
        const tierOrder = ["income", "fixed", "flexible", "savings"];
        return tierOrder.indexOf(a.waterfallTier) - tierOrder.indexOf(b.waterfallTier);
      }
      return a.sortOrder - b.sortOrder;
    });
    return { groups, categories };
  },
});

const suggestRowValidator = v.object({
  name: v.string(),
  normalizedKey: v.string(),
  transactionCount: v.number(),
  totalCents: v.number(),
});

export const suggestFromTransactions = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(suggestRowValidator),
  handler: async (ctx, args) => {
    assertSingleUserLocalMode();
    const cap = Math.min(args.limit ?? 100, 500);
    const txs = await ctx.db.query("transactions").collect();
    const map = new Map<
      string,
      {
        name: string;
        normalizedKey: string;
        transactionCount: number;
        totalCents: number;
      }
    >();

    for (const t of txs) {
      const raw = (t.category ?? "").trim();
      if (raw.length === 0) continue;
      const normalizedKey = normalizeCategoryKey(raw);
      const displayName = raw;
      const cur = map.get(normalizedKey) ?? {
        name: displayName,
        normalizedKey,
        transactionCount: 0,
        totalCents: 0,
      };
      cur.transactionCount += 1;
      if (t.type === "expense" || t.type === "fee" || t.type === "interest") {
        cur.totalCents += t.amountCents;
      } else if (t.type === "income" || t.type === "payment") {
        cur.totalCents -= t.amountCents;
      }
      cur.name = displayName;
      map.set(normalizedKey, cur);
    }

    return [...map.values()]
      .sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
      .slice(0, cap);
  },
});

export const createGroup = mutation({
  args: {
    name: v.string(),
    waterfallTier: v.union(
      v.literal("income"),
      v.literal("fixed"),
      v.literal("flexible"),
      v.literal("savings"),
    ),
    icon: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.id("categoryGroups"),
  handler: async (ctx, args): Promise<Id<"categoryGroups">> => {
    assertSingleUserLocalMode();
    const name = args.name.trim();
    if (name.length === 0) throw new Error("Group name is required");

    const existingSameName = await ctx.db
      .query("categoryGroups")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existingSameName) {
      throw new Error("A category group with this name already exists");
    }

    const existingTier = await ctx.db
      .query("categoryGroups")
      .withIndex("by_tier_sort", (q) => q.eq("waterfallTier", args.waterfallTier))
      .collect();
    const sortOrder =
      args.sortOrder ??
      existingTier.reduce((m, g) => Math.max(m, g.sortOrder), -1) + 1;

    const now = Date.now();
    return await ctx.db.insert("categoryGroups", {
      name,
      waterfallTier: args.waterfallTier,
      sortOrder,
      icon: args.icon?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateGroup = mutation({
  args: {
    groupId: v.id("categoryGroups"),
    name: v.optional(v.string()),
    waterfallTier: v.optional(
      v.union(
        v.literal("income"),
        v.literal("fixed"),
        v.literal("flexible"),
        v.literal("savings"),
      ),
    ),
    icon: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.groupId);
    if (!doc) throw new Error("Category group not found");
    if (doc.isSystem) {
      if (args.name !== undefined && args.name.trim() !== doc.name) {
        throw new Error("System groups cannot be renamed");
      }
    }
    const patch: Partial<Doc<"categoryGroups">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0) throw new Error("Group name is required");
      const clash = await ctx.db
        .query("categoryGroups")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (clash && clash._id !== args.groupId) {
        throw new Error("A category group with this name already exists");
      }
      patch.name = name;
    }
    if (args.waterfallTier !== undefined) {
      patch.waterfallTier = args.waterfallTier;
    }
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    if (args.icon !== undefined) patch.icon = args.icon.trim() || undefined;
    await ctx.db.patch(args.groupId, patch);
    return null;
  },
});

export const removeGroup = mutation({
  args: { groupId: v.id("categoryGroups") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.groupId);
    if (!doc) throw new Error("Category group not found");
    if (doc.isSystem) throw new Error("System groups cannot be removed");

    const lineRef = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_line_group", (q) => q.eq("categoryGroupId", args.groupId))
      .first();
    if (lineRef) {
      throw new Error("This group is used in a budget. Remove or change those line items first");
    }

    const children = await ctx.db
      .query("categories")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .first();
    if (children) {
      throw new Error("Remove or move categories before deleting this group");
    }

    await ctx.db.delete(args.groupId);
    return null;
  },
});

export const create = mutation({
  args: {
    groupId: v.id("categoryGroups"),
    name: v.string(),
    icon: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.id("categories"),
  handler: async (ctx, args): Promise<Id<"categories">> => {
    assertSingleUserLocalMode();
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Category group not found");

    const name = args.name.trim();
    if (name.length === 0) throw new Error("Category name is required");
    const normalizedKey = normalizeCategoryKey(name);
    if (normalizedKey.length === 0) throw new Error("Invalid category name");

    const dup = await ctx.db
      .query("categories")
      .withIndex("by_normalized_key", (q) => q.eq("normalizedKey", normalizedKey))
      .first();
    if (dup) throw new Error("A category with this name already exists");

    const siblings = await ctx.db
      .query("categories")
      .withIndex("by_group_sort", (q) => q.eq("groupId", args.groupId))
      .collect();
    const sortOrder =
      args.sortOrder ?? siblings.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;

    const now = Date.now();
    return await ctx.db.insert("categories", {
      name,
      groupId: args.groupId,
      normalizedKey,
      icon: args.icon?.trim() || undefined,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    categoryId: v.id("categories"),
    groupId: v.optional(v.id("categoryGroups")),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.categoryId);
    if (!doc) throw new Error("Category not found");

    const patch: Partial<Doc<"categories">> = { updatedAt: Date.now() };
    if (args.groupId !== undefined) {
      const g = await ctx.db.get(args.groupId);
      if (!g) throw new Error("Category group not found");
      patch.groupId = args.groupId;
    }
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0) throw new Error("Category name is required");
      const normalizedKey = normalizeCategoryKey(name);
      const clash = await ctx.db
        .query("categories")
        .withIndex("by_normalized_key", (q) => q.eq("normalizedKey", normalizedKey))
        .first();
      if (clash && clash._id !== args.categoryId) {
        throw new Error("A category with this name already exists");
      }
      patch.name = name;
      patch.normalizedKey = normalizedKey;
    }
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    if (args.icon !== undefined) patch.icon = args.icon.trim() || undefined;

    await ctx.db.patch(args.categoryId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { categoryId: v.id("categories") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const doc = await ctx.db.get(args.categoryId);
    if (!doc) throw new Error("Category not found");
    if (doc.isSystem) throw new Error("System categories cannot be removed");

    const lineRef = await ctx.db
      .query("budgetLineItems")
      .withIndex("by_line_category", (q) => q.eq("categoryId", args.categoryId))
      .first();
    if (lineRef) {
      throw new Error("This category is used in a budget. Remove or change that line item first");
    }

    await ctx.db.delete(args.categoryId);
    return null;
  },
});

export const seedFromTransactions = mutation({
  args: { groupId: v.optional(v.id("categoryGroups")) },
  returns: v.object({ createdCount: v.number() }),
  handler: async (ctx, args): Promise<{ createdCount: number }> => {
    assertSingleUserLocalMode();

    const group =
      args.groupId !== undefined
        ? await ctx.db.get(args.groupId)
        : await getOrCreateUncategorizedGroup(ctx);
    if (!group) throw new Error("Category group not found");

    const txs = await ctx.db.query("transactions").collect();
    const keys = new Set<string>();
    for (const t of txs) {
      const raw = (t.category ?? "").trim();
      if (raw.length === 0) continue;
      keys.add(normalizeCategoryKey(raw));
    }

    let createdCount = 0;
    const existing = await ctx.db.query("categories").collect();
    const existingKeys = new Set(existing.map((c) => c.normalizedKey));

    const siblings = await ctx.db
      .query("categories")
      .withIndex("by_group_sort", (q) => q.eq("groupId", group._id))
      .collect();
    let nextSort =
      siblings.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;

    const now = Date.now();
    for (const key of keys) {
      if (existingKeys.has(key)) continue;
      const sampleTx = txs.find(
        (t) => normalizeCategoryKey((t.category ?? "").trim()) === key,
      );
      const sampleName = sampleTx?.category?.trim() ?? key;

      await ctx.db.insert("categories", {
        name: sampleName.length > 0 ? sampleName : key,
        groupId: group._id,
        normalizedKey: key,
        sortOrder: nextSort,
        createdAt: now,
        updatedAt: now,
      });
      nextSort += 1;
      existingKeys.add(key);
      createdCount += 1;
    }

    return { createdCount };
  },
});

export const reorderGroups = mutation({
  args: { orderedGroupIds: v.array(v.id("categoryGroups")) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const now = Date.now();
    for (let i = 0; i < args.orderedGroupIds.length; i += 1) {
      const id = args.orderedGroupIds[i];
      const doc = await ctx.db.get(id);
      if (!doc) throw new Error("Category group not found");
      await ctx.db.patch(id, { sortOrder: i, updatedAt: now });
    }
    return null;
  },
});

export const reorderCategories = mutation({
  args: {
    groupId: v.id("categoryGroups"),
    orderedCategoryIds: v.array(v.id("categories")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const now = Date.now();
    for (let i = 0; i < args.orderedCategoryIds.length; i += 1) {
      const id = args.orderedCategoryIds[i];
      const doc = await ctx.db.get(id);
      if (!doc) throw new Error("Category not found");
      if (doc.groupId !== args.groupId) {
        throw new Error("Category does not belong to the specified group");
      }
      await ctx.db.patch(id, { sortOrder: i, updatedAt: now });
    }
    return null;
  },
});
