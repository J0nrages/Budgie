import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { buildTransactionDuplicateKey } from "./lib/ids";

const LEGACY_DEMO_ACCOUNT_SIGNATURES = new Set([
  "Checking|Demo Bank|4242",
  "Rewards Card|Demo Issuer|9911",
]);

const LEGACY_DEMO_TRANSACTION_DESCRIPTIONS = new Set([
  "Grocery run",
  "Card payment",
  "Coffee shops",
]);

function isLegacyDemoAccount(account: Doc<"accounts">): boolean {
  return LEGACY_DEMO_ACCOUNT_SIGNATURES.has(
    `${account.name}|${account.institution ?? ""}|${account.lastFour ?? ""}`,
  );
}

function isLegacyDemoTransaction(transaction: Doc<"transactions">): boolean {
  return LEGACY_DEMO_TRANSACTION_DESCRIPTIONS.has(transaction.description);
}

function isDemoAccount(account: Doc<"accounts">): boolean {
  return account.isDemo === true;
}

function isDemoTransaction(transaction: Doc<"transactions">): boolean {
  return transaction.isDemo === true;
}

export const demoState = query({
  args: {},
  returns: v.object({
    demoAccountCount: v.number(),
    demoTransactionCount: v.number(),
    realAccountCount: v.number(),
    legacyDemoDetected: v.boolean(),
    canSeed: v.boolean(),
    canRemoveDemo: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx) => {
    assertSingleUserLocalMode();
    const accounts = await ctx.db.query("accounts").collect();
    const transactions = await ctx.db.query("transactions").collect();

    const legacyDemoDetected =
      accounts.length === 2 &&
      transactions.length === 3 &&
      accounts.every(isLegacyDemoAccount) &&
      transactions.every(isLegacyDemoTransaction);

    const demoAccountCount = legacyDemoDetected
      ? accounts.length
      : accounts.filter(isDemoAccount).length;
    const demoTransactionCount = legacyDemoDetected
      ? transactions.length
      : transactions.filter(isDemoTransaction).length;
    const realAccountCount = legacyDemoDetected
      ? 0
      : accounts.filter((a) => !isDemoAccount(a)).length;

    const canSeed = accounts.length === 0;
    const canRemoveDemo = demoAccountCount > 0 || legacyDemoDetected;

    return {
      demoAccountCount,
      demoTransactionCount,
      realAccountCount,
      legacyDemoDetected,
      canSeed,
      canRemoveDemo,
      message: canSeed
        ? "Demo data can be loaded into this empty workspace."
        : legacyDemoDetected
          ? "Old short demo data is present. Reset it to load the dated demo trend set."
          : canRemoveDemo
          ? "Demo data is present and can be removed safely."
          : "Real account data is present, so demo seeding is disabled.",
    };
  },
});

export const run = mutation({
  args: {},
  returns: v.object({
    seeded: v.boolean(),
    message: v.string(),
  }),
  handler: async (
    ctx,
  ): Promise<{ seeded: boolean; message: string }> => {
    assertSingleUserLocalMode();
    const first = await ctx.db.query("accounts").first();
    if (first) {
      return {
        seeded: false,
        message:
          "Database already contains account data — skipping demo seed to avoid mixing with real records.",
      };
    }

    const now = Date.now();

    const checkingId = await ctx.db.insert("accounts", {
      name: "Checking",
      type: "asset",
      subtype: "checking",
      institution: "Demo Bank",
      lastFour: "4242",
      initialBalanceCents: 320_000,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });

    const cardId = await ctx.db.insert("accounts", {
      name: "Rewards Card",
      type: "liability",
      subtype: "creditCard",
      institution: "Demo Issuer",
      lastFour: "9911",
      initialBalanceCents: -82_000,
      creditLimitCents: 1_000_000,
      aprBps: 2199,
      statementDay: 12,
      paymentDueDay: 5,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("lenderProfiles", {
      accountId: cardId,
      aprBps: 2199,
      gracePeriodDays: 21,
      statementDay: 12,
      paymentDueDay: 5,
      interestMethod: "averageDailyBalance",
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });

    type TxArgs = {
      type: "income" | "expense" | "transfer" | "interest" | "fee";
      amountCents: number;
      accountId?: Id<"accounts">;
      fromAccountId?: Id<"accounts">;
      toAccountId?: Id<"accounts">;
      description: string;
      category?: string;
      incurredDate: string;
      isCleared: boolean;
      clearedDate?: string;
      duplicateAccountKey: string;
    };

    const insertTx = async (t: TxArgs) => {
      const duplicateKey = buildTransactionDuplicateKey({
        incurredDate: t.incurredDate,
        amountCents: t.amountCents,
        description: t.description,
        accountKey: t.duplicateAccountKey,
      });
      await ctx.db.insert("transactions", {
        type: t.type,
        amountCents: t.amountCents,
        accountId: t.accountId,
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        description: t.description,
        category: t.category,
        incurredDate: t.incurredDate,
        isCleared: t.isCleared,
        clearedDate: t.clearedDate,
        duplicateKey,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      });
    };

    const demoTransactions: TxArgs[] = [
      {
        type: "income",
        amountCents: 285_000,
        accountId: checkingId,
        description: "Paycheck",
        category: "Income",
        incurredDate: "2025-03-07",
        isCleared: true,
        clearedDate: "2025-03-07",
        duplicateAccountKey: checkingId,
      },
      {
        type: "expense",
        amountCents: 145_000,
        accountId: checkingId,
        description: "Rent",
        category: "Housing",
        incurredDate: "2025-03-08",
        isCleared: true,
        clearedDate: "2025-03-08",
        duplicateAccountKey: checkingId,
      },
      {
        type: "expense",
        amountCents: 8_950,
        accountId: checkingId,
        description: "Utilities",
        category: "Bills",
        incurredDate: "2025-03-10",
        isCleared: true,
        clearedDate: "2025-03-11",
        duplicateAccountKey: checkingId,
      },
      {
        type: "expense",
        amountCents: 12_050,
        accountId: cardId,
        description: "Grocery run",
        category: "Food",
        incurredDate: "2025-03-12",
        isCleared: true,
        clearedDate: "2025-03-13",
        duplicateAccountKey: cardId,
      },
      {
        type: "expense",
        amountCents: 6_800,
        accountId: cardId,
        description: "Gas station",
        category: "Transportation",
        incurredDate: "2025-03-15",
        isCleared: true,
        clearedDate: "2025-03-16",
        duplicateAccountKey: cardId,
      },
      {
        type: "transfer",
        amountCents: 62_000,
        fromAccountId: checkingId,
        toAccountId: cardId,
        description: "Card payment",
        incurredDate: "2025-03-18",
        isCleared: true,
        clearedDate: "2025-03-19",
        duplicateAccountKey: `${checkingId}>${cardId}`,
      },
      {
        type: "income",
        amountCents: 285_000,
        accountId: checkingId,
        description: "Paycheck",
        category: "Income",
        incurredDate: "2025-03-21",
        isCleared: true,
        clearedDate: "2025-03-21",
        duplicateAccountKey: checkingId,
      },
      {
        type: "expense",
        amountCents: 18_430,
        accountId: cardId,
        description: "Home improvement",
        category: "Home",
        incurredDate: "2025-03-23",
        isCleared: true,
        clearedDate: "2025-03-24",
        duplicateAccountKey: cardId,
      },
      {
        type: "fee",
        amountCents: 1_200,
        accountId: cardId,
        description: "Card fee",
        category: "Fees",
        incurredDate: "2025-03-28",
        isCleared: true,
        clearedDate: "2025-03-28",
        duplicateAccountKey: cardId,
      },
      {
        type: "income",
        amountCents: 285_000,
        accountId: checkingId,
        description: "Paycheck",
        category: "Income",
        incurredDate: "2025-04-04",
        isCleared: true,
        clearedDate: "2025-04-04",
        duplicateAccountKey: checkingId,
      },
      {
        type: "expense",
        amountCents: 145_000,
        accountId: checkingId,
        description: "Rent",
        category: "Housing",
        incurredDate: "2025-04-05",
        isCleared: true,
        clearedDate: "2025-04-05",
        duplicateAccountKey: checkingId,
      },
      {
        type: "expense",
        amountCents: 4_500,
        accountId: cardId,
        description: "Coffee shops",
        category: "Food",
        incurredDate: "2025-04-09",
        isCleared: true,
        clearedDate: "2025-04-10",
        duplicateAccountKey: cardId,
      },
      {
        type: "expense",
        amountCents: 24_275,
        accountId: cardId,
        description: "Weekend travel",
        category: "Travel",
        incurredDate: "2025-04-12",
        isCleared: true,
        clearedDate: "2025-04-14",
        duplicateAccountKey: cardId,
      },
      {
        type: "transfer",
        amountCents: 80_000,
        fromAccountId: checkingId,
        toAccountId: cardId,
        description: "Card payment",
        incurredDate: "2025-04-16",
        isCleared: true,
        clearedDate: "2025-04-17",
        duplicateAccountKey: `${checkingId}>${cardId}`,
      },
      {
        type: "income",
        amountCents: 285_000,
        accountId: checkingId,
        description: "Paycheck",
        category: "Income",
        incurredDate: "2025-04-18",
        isCleared: true,
        clearedDate: "2025-04-18",
        duplicateAccountKey: checkingId,
      },
      {
        type: "expense",
        amountCents: 15_980,
        accountId: cardId,
        description: "Grocery run",
        category: "Food",
        incurredDate: "2025-04-20",
        isCleared: true,
        clearedDate: "2025-04-21",
        duplicateAccountKey: cardId,
      },
      {
        type: "interest",
        amountCents: 2_325,
        accountId: cardId,
        description: "Statement interest",
        category: "Interest",
        incurredDate: "2025-04-22",
        isCleared: true,
        clearedDate: "2025-04-22",
        duplicateAccountKey: cardId,
      },
      {
        type: "expense",
        amountCents: 6_750,
        accountId: checkingId,
        description: "Internet bill",
        category: "Bills",
        incurredDate: "2025-04-24",
        isCleared: true,
        clearedDate: "2025-04-25",
        duplicateAccountKey: checkingId,
      },
      {
        type: "expense",
        amountCents: 11_600,
        accountId: cardId,
        description: "Pending dinner",
        category: "Dining",
        incurredDate: "2025-04-28",
        isCleared: false,
        duplicateAccountKey: cardId,
      },
    ];

    for (const transaction of demoTransactions) {
      await insertTx(transaction);
    }

    return {
      seeded: true,
      message:
        "Inserted demo accounts, lender profile, and dated transactions.",
    };
  },
});

export const removeDemo = mutation({
  args: {},
  returns: v.object({
    removed: v.boolean(),
    message: v.string(),
  }),
  handler: async (
    ctx,
  ): Promise<{ removed: boolean; message: string }> => {
    assertSingleUserLocalMode();

    const accounts = await ctx.db.query("accounts").collect();
    const transactions = await ctx.db.query("transactions").collect();

    const legacyDemoDetected =
      accounts.length === 2 &&
      transactions.length === 3 &&
      accounts.every(isLegacyDemoAccount) &&
      transactions.every(isLegacyDemoTransaction);

    const demoAccounts = legacyDemoDetected
      ? accounts
      : accounts.filter(isDemoAccount);
    const demoAccountIds = new Set(demoAccounts.map((a) => a._id));
    const demoTransactions = legacyDemoDetected
      ? transactions
      : transactions.filter(isDemoTransaction);
    const demoTransactionIds = new Set(demoTransactions.map((t) => t._id));

    if (demoAccounts.length === 0 && demoTransactions.length === 0) {
      return {
        removed: false,
        message: "No removable demo data was found.",
      };
    }

    const realLinkedTransaction = transactions.find((t) => {
      if (demoTransactionIds.has(t._id)) return false;
      return (
        (t.accountId !== undefined && demoAccountIds.has(t.accountId)) ||
        (t.fromAccountId !== undefined && demoAccountIds.has(t.fromAccountId)) ||
        (t.toAccountId !== undefined && demoAccountIds.has(t.toAccountId))
      );
    });
    if (realLinkedTransaction) {
      throw new Error(
        "Cannot remove demo accounts because non-demo transactions reference them.",
      );
    }

    const statementFiles = await ctx.db.query("statementFiles").collect();
    const linkedStatement = statementFiles.find(
      (s) => s.accountId !== undefined && demoAccountIds.has(s.accountId),
    );
    if (linkedStatement) {
      throw new Error(
        "Cannot remove demo accounts because statement files reference them.",
      );
    }

    const jobs = await ctx.db.query("importJobs").collect();
    const linkedJob = jobs.find(
      (j) => j.accountId !== undefined && demoAccountIds.has(j.accountId),
    );
    if (linkedJob) {
      throw new Error(
        "Cannot remove demo accounts because import jobs reference them.",
      );
    }

    const rows = await ctx.db.query("importRows").collect();
    const linkedRow = rows.find(
      (r) => r.accountId !== undefined && demoAccountIds.has(r.accountId),
    );
    if (linkedRow) {
      throw new Error(
        "Cannot remove demo accounts because import review rows reference them.",
      );
    }

    for (const transaction of demoTransactions) {
      await ctx.db.delete(transaction._id);
    }

    const profiles = await ctx.db.query("lenderProfiles").collect();
    for (const profile of profiles) {
      if (
        profile.isDemo === true ||
        (legacyDemoDetected && demoAccountIds.has(profile.accountId))
      ) {
        await ctx.db.delete(profile._id);
      }
    }

    for (const account of demoAccounts) {
      await ctx.db.delete(account._id);
    }

    return {
      removed: true,
      message: legacyDemoDetected
        ? "Removed legacy demo accounts and transactions."
        : "Removed demo accounts and transactions.",
    };
  },
});
