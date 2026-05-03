import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import {
  accountSubtypeValidator,
  accountTypeValidator,
  interestMethodValidator,
} from "./validators";

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t.length === 0 ? undefined : t;
}

export const list = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx): Promise<Doc<"accounts">[]> => {
    assertSingleUserLocalMode();
    return await ctx.db.query("accounts").collect();
  },
});

export const get = query({
  args: { accountId: v.id("accounts") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args): Promise<Doc<"accounts"> | null> => {
    assertSingleUserLocalMode();
    return await ctx.db.get(args.accountId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: accountTypeValidator,
    subtype: accountSubtypeValidator,
    institution: v.optional(v.string()),
    lastFour: v.optional(v.string()),
    initialBalanceCents: v.number(),
    creditLimitCents: v.optional(v.number()),
    aprBps: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    paymentDueDay: v.optional(v.number()),
    lenderProfile: v.optional(
      v.object({
        aprBps: v.optional(v.number()),
        gracePeriodDays: v.optional(v.number()),
        statementDay: v.optional(v.number()),
        paymentDueDay: v.optional(v.number()),
        interestMethod: interestMethodValidator,
      }),
    ),
  },
  returns: v.id("accounts"),
  handler: async (ctx, args): Promise<Id<"accounts">> => {
    assertSingleUserLocalMode();
    const now = Date.now();
    const name = args.name.trim();
    if (name.length === 0) throw new Error("Account name is required");

    const institution = normalizeOptionalString(args.institution);
    const lastFour = normalizeOptionalString(args.lastFour);

    const dup = await ctx.db
      .query("accounts")
      .withIndex("by_type_name", (q) =>
        q.eq("type", args.type).eq("name", name),
      )
      .unique()
      .catch(() => null);
    if (dup) throw new Error("An account with this type and name already exists");

    const accountId = await ctx.db.insert("accounts", {
      name,
      type: args.type,
      subtype: args.subtype,
      institution,
      lastFour,
      initialBalanceCents: args.initialBalanceCents,
      creditLimitCents: args.creditLimitCents,
      aprBps: args.aprBps,
      statementDay: args.statementDay,
      paymentDueDay: args.paymentDueDay,
      createdAt: now,
      updatedAt: now,
    });

    if (args.lenderProfile) {
      await ctx.db.insert("lenderProfiles", {
        accountId,
        aprBps: args.lenderProfile.aprBps,
        gracePeriodDays: args.lenderProfile.gracePeriodDays,
        statementDay: args.lenderProfile.statementDay,
        paymentDueDay: args.lenderProfile.paymentDueDay,
        interestMethod: args.lenderProfile.interestMethod,
        createdAt: now,
        updatedAt: now,
      });
    }

    return accountId;
  },
});

export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
    institution: v.optional(v.string()),
    lastFour: v.optional(v.string()),
    initialBalanceCents: v.optional(v.number()),
    creditLimitCents: v.optional(v.number()),
    aprBps: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    paymentDueDay: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const existing = await ctx.db.get(args.accountId);
    if (!existing) throw new Error("Account not found");

    const patch: Partial<Doc<"accounts">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0) throw new Error("Account name is required");
      const clash = await ctx.db
        .query("accounts")
        .withIndex("by_type_name", (q) =>
          q.eq("type", existing.type).eq("name", name),
        )
        .unique()
        .catch(() => null);
      if (clash && clash._id !== args.accountId) {
        throw new Error("Another account already uses this name for this type");
      }
      patch.name = name;
    }
    if (args.institution !== undefined) {
      patch.institution = normalizeOptionalString(args.institution);
    }
    if (args.lastFour !== undefined) {
      patch.lastFour = normalizeOptionalString(args.lastFour);
    }
    if (args.initialBalanceCents !== undefined) {
      patch.initialBalanceCents = args.initialBalanceCents;
    }
    if (args.creditLimitCents !== undefined) {
      patch.creditLimitCents = args.creditLimitCents;
    }
    if (args.aprBps !== undefined) patch.aprBps = args.aprBps;
    if (args.statementDay !== undefined) patch.statementDay = args.statementDay;
    if (args.paymentDueDay !== undefined) {
      patch.paymentDueDay = args.paymentDueDay;
    }

    await ctx.db.patch(args.accountId, patch);
    return null;
  },
});

async function accountReferenced(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
): Promise<boolean> {
  const tx = await ctx.db
    .query("transactions")
    .withIndex("by_account_incurred", (q) => q.eq("accountId", accountId))
    .first();
  if (tx) return true;
  const tf = await ctx.db
    .query("transactions")
    .withIndex("by_from_incurred", (q) => q.eq("fromAccountId", accountId))
    .first();
  if (tf) return true;
  const tt = await ctx.db
    .query("transactions")
    .withIndex("by_to_incurred", (q) => q.eq("toAccountId", accountId))
    .first();
  if (tt) return true;

  const sf = await ctx.db
    .query("statementFiles")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();
  if (sf) return true;

  const ij = await ctx.db
    .query("importJobs")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();
  if (ij) return true;

  const ir = await ctx.db
    .query("importRows")
    .withIndex("by_row_account", (q) => q.eq("accountId", accountId))
    .first();
  if (ir) return true;

  const lp = await ctx.db
    .query("lenderProfiles")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();
  if (lp) return true;

  return false;
}

export const remove = mutation({
  args: { accountId: v.id("accounts") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const existing = await ctx.db.get(args.accountId);
    if (!existing) throw new Error("Account not found");

    if (await accountReferenced(ctx, args.accountId)) {
      throw new Error(
        "Cannot delete account while transactions, imports, statements, or lender data reference it",
      );
    }

    await ctx.db.delete(args.accountId);
    return null;
  },
});
