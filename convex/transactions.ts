import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { assertIsoDate } from "./lib/datesIso";
import { buildTransactionDuplicateKey } from "./lib/ids";
import { transactionTypeValidator } from "./validators";

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t.length === 0 ? undefined : t;
}

function assertPositiveAmount(amountCents: number): void {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Amount must be a positive number of cents");
  }
}

async function requireAccount(
  ctx: { db: { get: (id: Id<"accounts">) => Promise<Doc<"accounts"> | null> } },
  id: Id<"accounts">,
  label: string,
): Promise<void> {
  const a = await ctx.db.get(id);
  if (!a) throw new Error(`${label} account not found`);
}

export const list = query({
  args: {
    accountId: v.optional(v.id("accounts")),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Doc<"transactions">[]> => {
    assertSingleUserLocalMode();
    const limit = Math.min(args.limit ?? 500, 2000);

    if (args.accountId) {
      const primary = await ctx.db
        .query("transactions")
        .withIndex("by_account_incurred", (q) =>
          q.eq("accountId", args.accountId!),
        )
        .order("desc")
        .take(limit);

      const from = await ctx.db
        .query("transactions")
        .withIndex("by_from_incurred", (q) =>
          q.eq("fromAccountId", args.accountId!),
        )
        .order("desc")
        .take(limit);

      const to = await ctx.db
        .query("transactions")
        .withIndex("by_to_incurred", (q) =>
          q.eq("toAccountId", args.accountId!),
        )
        .order("desc")
        .take(limit);

      const map = new Map<string, Doc<"transactions">>();
      for (const t of [...primary, ...from, ...to]) {
        map.set(t._id, t);
      }
      return [...map.values()].sort((a, b) => {
        if (a.incurredDate !== b.incurredDate) {
          return a.incurredDate < b.incurredDate ? 1 : -1;
        }
        return b.createdAt - a.createdAt;
      });
    }

    const all = await ctx.db.query("transactions").collect();
    return all
      .sort((a, b) => {
        if (a.incurredDate !== b.incurredDate) {
          return a.incurredDate < b.incurredDate ? 1 : -1;
        }
        return b.createdAt - a.createdAt;
      })
      .slice(0, limit);
  },
});

export const get = query({
  args: { transactionId: v.id("transactions") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args): Promise<Doc<"transactions"> | null> => {
    assertSingleUserLocalMode();
    return await ctx.db.get(args.transactionId);
  },
});

export const create = mutation({
  args: {
    type: transactionTypeValidator,
    amountCents: v.number(),
    accountId: v.optional(v.id("accounts")),
    fromAccountId: v.optional(v.id("accounts")),
    toAccountId: v.optional(v.id("accounts")),
    description: v.string(),
    category: v.optional(v.string()),
    incurredDate: v.string(),
    isCleared: v.boolean(),
    clearedDate: v.optional(v.string()),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args): Promise<Id<"transactions">> => {
    assertSingleUserLocalMode();
    assertPositiveAmount(args.amountCents);
    assertIsoDate("Incurred date", args.incurredDate);
    if (args.isCleared) {
      if (!args.clearedDate) {
        throw new Error("Cleared transactions require a cleared date");
      }
      assertIsoDate("Cleared date", args.clearedDate);
    } else if (args.clearedDate) {
      throw new Error("Cannot set cleared date on a pending transaction");
    }

    const description = args.description.trim();
    if (description.length === 0) throw new Error("Description is required");

    if (args.type === "transfer") {
      if (!args.fromAccountId || !args.toAccountId) {
        throw new Error("Transfers require from and to accounts");
      }
      if (args.fromAccountId === args.toAccountId) {
        throw new Error("Transfer accounts must differ");
      }
      if (args.accountId) {
        throw new Error("Transfers should not set a primary accountId");
      }
      await requireAccount(ctx, args.fromAccountId, "From");
      await requireAccount(ctx, args.toAccountId, "To");
    } else {
      if (!args.accountId) {
        throw new Error("This transaction type requires an account");
      }
      if (args.fromAccountId || args.toAccountId) {
        throw new Error("Only transfers may set from/to accounts");
      }
      await requireAccount(ctx, args.accountId, "Account");
    }

    const category = normalizeOptionalString(args.category);

    const duplicateKey = buildTransactionDuplicateKey({
      incurredDate: args.incurredDate,
      amountCents: args.amountCents,
      description,
      accountKey:
        args.type === "transfer"
          ? `${args.fromAccountId}>${args.toAccountId}`
          : args.accountId!,
    });

    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_duplicateKey", (q) => q.eq("duplicateKey", duplicateKey))
      .first();
    if (existing) {
      throw new Error("A transaction with the same duplicate signature already exists");
    }

    const now = Date.now();
    return await ctx.db.insert("transactions", {
      type: args.type,
      amountCents: args.amountCents,
      accountId: args.accountId,
      fromAccountId: args.fromAccountId,
      toAccountId: args.toAccountId,
      description,
      category,
      incurredDate: args.incurredDate,
      isCleared: args.isCleared,
      clearedDate: args.clearedDate,
      duplicateKey,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    transactionId: v.id("transactions"),
    type: v.optional(transactionTypeValidator),
    amountCents: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    fromAccountId: v.optional(v.id("accounts")),
    toAccountId: v.optional(v.id("accounts")),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    incurredDate: v.optional(v.string()),
    isCleared: v.optional(v.boolean()),
    clearedDate: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const existing = await ctx.db.get(args.transactionId);
    if (!existing) throw new Error("Transaction not found");

    const nextType = args.type ?? existing.type;
    const nextAmount = args.amountCents ?? existing.amountCents;
    assertPositiveAmount(nextAmount);

    const nextIncurred = args.incurredDate ?? existing.incurredDate;
    assertIsoDate("Incurred date", nextIncurred);

    const nextCleared = args.isCleared ?? existing.isCleared;
    const nextClearedDate = args.clearedDate ?? existing.clearedDate;
    if (args.isCleared !== undefined || args.clearedDate !== undefined) {
      if (nextCleared) {
        if (!nextClearedDate) {
          throw new Error("Cleared transactions require a cleared date");
        }
        assertIsoDate("Cleared date", nextClearedDate);
      } else if (nextClearedDate) {
        throw new Error("Cannot keep cleared date on a pending transaction");
      }
    }

    let nextAccountId = args.accountId ?? existing.accountId;
    let nextFrom = args.fromAccountId ?? existing.fromAccountId;
    let nextTo = args.toAccountId ?? existing.toAccountId;

    if (nextType === "transfer") {
      if (!nextFrom || !nextTo) throw new Error("Transfers require from and to accounts");
      if (nextFrom === nextTo) throw new Error("Transfer accounts must differ");
      nextAccountId = undefined;
      await requireAccount(ctx, nextFrom, "From");
      await requireAccount(ctx, nextTo, "To");
    } else {
      if (!nextAccountId) throw new Error("This transaction type requires an account");
      nextFrom = undefined;
      nextTo = undefined;
      await requireAccount(ctx, nextAccountId, "Account");
    }

    const nextDescription = args.description
      ? args.description.trim()
      : existing.description;
    if (nextDescription.length === 0) throw new Error("Description is required");

    const nextCategory =
      args.category !== undefined
        ? normalizeOptionalString(args.category)
        : existing.category;

    const duplicateKey = buildTransactionDuplicateKey({
      incurredDate: nextIncurred,
      amountCents: nextAmount,
      description: nextDescription,
      accountKey:
        nextType === "transfer" ? `${nextFrom}>${nextTo}` : nextAccountId!,
    });

    const clash = await ctx.db
      .query("transactions")
      .withIndex("by_duplicateKey", (q) => q.eq("duplicateKey", duplicateKey))
      .first();
    if (clash && clash._id !== args.transactionId) {
      throw new Error("Update would duplicate another transaction");
    }

    await ctx.db.patch(args.transactionId, {
      type: nextType,
      amountCents: nextAmount,
      accountId: nextAccountId,
      fromAccountId: nextFrom,
      toAccountId: nextTo,
      description: nextDescription,
      category: nextCategory,
      incurredDate: nextIncurred,
      isCleared: nextCleared,
      clearedDate: nextCleared ? nextClearedDate : undefined,
      duplicateKey,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const remove = mutation({
  args: { transactionId: v.id("transactions") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const existing = await ctx.db.get(args.transactionId);
    if (!existing) throw new Error("Transaction not found");

    const row = await ctx.db
      .query("importRows")
      .filter((q) =>
        q.eq(q.field("acceptedTransactionId"), args.transactionId),
      )
      .first();
    if (row) {
      await ctx.db.patch(row._id, {
        acceptedTransactionId: undefined,
        status: "needsReview",
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(args.transactionId);
    return null;
  },
});
