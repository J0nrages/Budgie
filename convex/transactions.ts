import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { assertIsoDate } from "./lib/datesIso";
import { buildTransactionDuplicateKey } from "./lib/ids";
import { postingStatusValidator, transactionTypeValidator } from "./validators";

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
    transactionDate: v.optional(v.string()),
    postedDate: v.optional(v.string()),
    merchantName: v.optional(v.string()),
    merchantId: v.optional(v.id("merchants")),
    originalDescription: v.optional(v.string()),
    memo: v.optional(v.string()),
    bankTransactionId: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    checkNumber: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    importedBalanceCents: v.optional(v.number()),
    postingStatus: v.optional(postingStatusValidator),
    pendingMatchesKey: v.optional(v.string()),
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

    if (args.transactionDate !== undefined && args.transactionDate.trim().length > 0) {
      assertIsoDate("Transaction date", args.transactionDate);
    }
    if (args.postedDate !== undefined && args.postedDate.trim().length > 0) {
      assertIsoDate("Posted date", args.postedDate);
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
    const transactionDate = normalizeOptionalString(args.transactionDate);
    const postedDate = normalizeOptionalString(args.postedDate);
    const merchantName = normalizeOptionalString(args.merchantName);
    const originalDescription = normalizeOptionalString(args.originalDescription);
    const memo = normalizeOptionalString(args.memo);
    const bankTransactionId = normalizeOptionalString(args.bankTransactionId);
    const referenceNumber = normalizeOptionalString(args.referenceNumber);
    const checkNumber = normalizeOptionalString(args.checkNumber);
    const currencyCode = normalizeOptionalString(args.currencyCode);
    const pendingMatchesKey = normalizeOptionalString(args.pendingMatchesKey);

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
      transactionDate,
      postedDate,
      merchantName,
      merchantId: args.merchantId,
      originalDescription: originalDescription ?? description,
      memo,
      bankTransactionId,
      referenceNumber,
      checkNumber,
      currencyCode,
      importedBalanceCents: args.importedBalanceCents,
      postingStatus: args.postingStatus,
      pendingMatchesKey,
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
    transactionDate: v.optional(v.string()),
    postedDate: v.optional(v.string()),
    merchantName: v.optional(v.string()),
    merchantId: v.optional(v.id("merchants")),
    originalDescription: v.optional(v.string()),
    memo: v.optional(v.string()),
    bankTransactionId: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    checkNumber: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    importedBalanceCents: v.optional(v.number()),
    postingStatus: v.optional(postingStatusValidator),
    pendingMatchesKey: v.optional(v.string()),
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

    if (args.transactionDate !== undefined && args.transactionDate.trim().length > 0) {
      assertIsoDate("Transaction date", args.transactionDate);
    }
    if (args.postedDate !== undefined && args.postedDate.trim().length > 0) {
      assertIsoDate("Posted date", args.postedDate);
    }

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

    const patch: Partial<Doc<"transactions">> = {
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
    };

    if (args.transactionDate !== undefined) {
      patch.transactionDate = normalizeOptionalString(args.transactionDate);
    }
    if (args.postedDate !== undefined) {
      patch.postedDate = normalizeOptionalString(args.postedDate);
    }
    if (args.merchantName !== undefined) {
      patch.merchantName = normalizeOptionalString(args.merchantName);
    }
    if (args.merchantId !== undefined) {
      patch.merchantId = args.merchantId;
    }
    if (args.originalDescription !== undefined) {
      patch.originalDescription = normalizeOptionalString(args.originalDescription);
    }
    if (args.memo !== undefined) {
      patch.memo = normalizeOptionalString(args.memo);
    }
    if (args.bankTransactionId !== undefined) {
      patch.bankTransactionId = normalizeOptionalString(args.bankTransactionId);
    }
    if (args.referenceNumber !== undefined) {
      patch.referenceNumber = normalizeOptionalString(args.referenceNumber);
    }
    if (args.checkNumber !== undefined) {
      patch.checkNumber = normalizeOptionalString(args.checkNumber);
    }
    if (args.currencyCode !== undefined) {
      patch.currencyCode = normalizeOptionalString(args.currencyCode);
    }
    if (args.importedBalanceCents !== undefined) {
      patch.importedBalanceCents = args.importedBalanceCents;
    }
    if (args.postingStatus !== undefined) {
      patch.postingStatus = args.postingStatus;
    }
    if (args.pendingMatchesKey !== undefined) {
      patch.pendingMatchesKey = normalizeOptionalString(args.pendingMatchesKey);
    }

    await ctx.db.patch(args.transactionId, patch);

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
      .withIndex("by_accepted_transaction", (q) =>
        q.eq("acceptedTransactionId", args.transactionId),
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
