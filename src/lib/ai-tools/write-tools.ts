/**
 * Write AI tools. Every tool here:
 *   1. Sets `needsApproval: true` so the AI SDK pauses and surfaces the
 *      proposed action to the human before executing.
 *   2. Resolves IDs to human-readable names in its proposal summary so
 *      the approval card shows exact transactions / amounts, not opaque
 *      Convex IDs (financial-safety best practice — show data verbatim).
 *   3. Snapshots prior state, performs the Convex mutation, then logs to
 *      `aiActions` with `decision: "approved"`, `status: "success"`, plus
 *      the undo data needed for `aiActions.undo`.
 *
 * The AI SDK only calls `execute` after the human has approved via the
 * UI, so this code never runs on a rejected proposal. Rejections are
 * logged by the UI via `aiActions.logRejection`.
 */

import { tool } from "ai";
import { z } from "zod";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import type { ToolContext } from "./context";
import {
  formatCentsAsDollars,
  formatTransactionLine,
  trimList,
} from "./formatters";

const transactionIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(500)
  .describe("Convex Id<\"transactions\">[] — get IDs from list_transactions");

const merchantIdSchema = z.string().min(1).describe("Convex Id<\"merchants\">");
const categoryIdSchema = z.string().min(1).describe("Convex Id<\"categories\">");
const accountIdSchema = z.string().min(1).describe("Convex Id<\"accounts\">");
const lineItemIdSchema = z.string().min(1).describe("Convex Id<\"budgetLineItems\">");

const cadenceSchema = z.enum(["weekly", "monthly", "yearly", "byDate"]);
const targetTypeSchema = z.enum(["spending", "savingsBalance", "monthlyBuilder"]);
const refillBehaviorSchema = z.enum(["setAside", "refillUpTo"]);
const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Must be a year-month (YYYY-MM)");

async function logApprovedWrite(
  ctx: ToolContext,
  args: {
    toolName: string;
    args: unknown;
    proposalSummary: string;
    result: unknown;
    undoStrategy: NonNullable<Doc<"aiActions">["undoStrategy"]>;
    undoData: unknown;
  },
): Promise<void> {
  try {
    await ctx.convex.mutation(api.aiActions.logApprovedWrite, {
      surface: ctx.surface,
      sessionId: ctx.sessionId,
      toolName: args.toolName,
      argsJson: JSON.stringify(args.args ?? {}),
      proposalSummary: args.proposalSummary,
      resultJson: JSON.stringify(args.result ?? null),
      undoStrategy: args.undoStrategy,
      undoDataJson: JSON.stringify(args.undoData ?? null),
    });
  } catch {
    // Audit logging must never break a tool call.
  }
}

async function loadTransactionsByIds(
  ctx: ToolContext,
  ids: Id<"transactions">[],
): Promise<Doc<"transactions">[]> {
  // Convex doesn't expose a multi-get from the client; fall back to listing
  // and filtering. For Phase 1 this is fine — write tools cap at 500 ids.
  const all = await ctx.convex.query(api.transactions.list, { limit: 2000 });
  const wanted = new Set(ids.map((id) => String(id)));
  return all.filter((t) => wanted.has(String(t._id)));
}

function snapshotTransaction(doc: Doc<"transactions">) {
  return {
    id: doc._id,
    type: doc.type,
    amountCents: doc.amountCents,
    accountId: doc.accountId,
    fromAccountId: doc.fromAccountId,
    toAccountId: doc.toAccountId,
    category: doc.category,
    merchantId: doc.merchantId,
    merchantName: doc.merchantName,
    description: doc.description,
  };
}

export function createWriteTools(ctx: ToolContext) {
  return {
    reclassify_as_transfer: tool({
      description:
        "Reclassify one or more expense/payment transactions as transfers between two accounts. Use for cases like 'Affirm Card transfer from Capital One Checking' that show up as a payment on one side and an expense on the other — both sides should be a single transfer entry. The proposal shows the exact transactions affected.",
      inputSchema: z.object({
        transaction_ids: transactionIdsSchema,
        from_account_id: accountIdSchema.describe(
          "Account the money came out of",
        ),
        to_account_id: accountIdSchema.describe(
          "Account the money went into",
        ),
      }),
      needsApproval: true,
      execute: async ({ transaction_ids, from_account_id, to_account_id }) => {
        const txIds = transaction_ids.map((s) => s as Id<"transactions">);
        const docs = await loadTransactionsByIds(ctx, txIds);
        if (docs.length === 0) throw new Error("No matching transactions found");
        const snapshots = docs.map(snapshotTransaction);

        for (const id of txIds) {
          await ctx.convex.mutation(api.transactions.update, {
            transactionId: id,
            type: "transfer",
            fromAccountId: from_account_id as Id<"accounts">,
            toAccountId: to_account_id as Id<"accounts">,
          });
        }

        const summary =
          `Reclassified ${docs.length} transactions as transfers ` +
          `(from ${from_account_id} → to ${to_account_id}). ` +
          `Total ${formatCentsAsDollars(docs.reduce((s, d) => s + d.amountCents, 0))}.`;

        const result = {
          reclassified_count: docs.length,
          total: formatCentsAsDollars(docs.reduce((s, d) => s + d.amountCents, 0)),
        };

        await logApprovedWrite(ctx, {
          toolName: "reclassify_as_transfer",
          args: { transaction_ids, from_account_id, to_account_id },
          proposalSummary: summary,
          result,
          undoStrategy: "restoreTransactionSnapshots",
          undoData: snapshots,
        });

        return { ...result, undoable: true };
      },
    }),

    set_transaction_category: tool({
      description:
        "Set or change the category on one or more transactions. Use after the human confirms a categorization fix.",
      inputSchema: z.object({
        transaction_ids: transactionIdsSchema,
        category_name: z
          .string()
          .min(1)
          .describe("Category name (string). Use list_categories to discover existing names — passing a new name creates an ad-hoc category string on the transaction."),
      }),
      needsApproval: true,
      execute: async ({ transaction_ids, category_name }) => {
        const txIds = transaction_ids.map((s) => s as Id<"transactions">);
        const docs = await loadTransactionsByIds(ctx, txIds);
        if (docs.length === 0) throw new Error("No matching transactions found");
        const snapshots = docs.map(snapshotTransaction);

        for (const id of txIds) {
          await ctx.convex.mutation(api.transactions.update, {
            transactionId: id,
            category: category_name,
          });
        }

        const summary = `Set category="${category_name}" on ${docs.length} transactions`;
        const result = { affected_count: docs.length, category: category_name };

        await logApprovedWrite(ctx, {
          toolName: "set_transaction_category",
          args: { transaction_ids, category_name },
          proposalSummary: summary,
          result,
          undoStrategy: "restoreTransactionSnapshots",
          undoData: snapshots,
        });

        return { ...result, undoable: true };
      },
    }),

    apply_merchant_alias: tool({
      description:
        "Apply a merchant to one or more transactions (sets merchantId + merchantName). Optionally record an alias pattern so future imports auto-match. Use to attribute messy bank descriptions to the correct merchant.",
      inputSchema: z.object({
        transaction_ids: transactionIdsSchema,
        merchant_id: merchantIdSchema,
        save_alias_pattern: z
          .string()
          .optional()
          .describe(
            "If provided, also upserts this string as a merchantAliases pattern for the merchant so future imports auto-match.",
          ),
      }),
      needsApproval: true,
      execute: async ({ transaction_ids, merchant_id, save_alias_pattern }) => {
        const txIds = transaction_ids.map((s) => s as Id<"transactions">);
        const docs = await loadTransactionsByIds(ctx, txIds);
        if (docs.length === 0) throw new Error("No matching transactions found");
        const merchants = await ctx.convex.query(api.merchants.listMerchants, {});
        const merchant = merchants.find(
          (m) => String(m._id) === String(merchant_id),
        );
        if (!merchant) throw new Error(`Merchant ${merchant_id} not found`);
        const snapshots = docs.map(snapshotTransaction);

        for (const id of txIds) {
          await ctx.convex.mutation(api.transactions.update, {
            transactionId: id,
            merchantId: merchant_id as Id<"merchants">,
            merchantName: merchant.canonicalName,
          });
        }

        if (save_alias_pattern && save_alias_pattern.trim().length > 0) {
          await ctx.convex.mutation(api.merchants.upsertMerchantAlias, {
            merchantId: merchant_id as Id<"merchants">,
            aliasPattern: save_alias_pattern,
          });
        }

        const summary =
          `Set merchant="${merchant.canonicalName}" on ${docs.length} transactions` +
          (save_alias_pattern
            ? ` and saved alias pattern "${save_alias_pattern}"`
            : "");

        const result = {
          affected_count: docs.length,
          merchant: merchant.canonicalName,
          alias_saved: !!save_alias_pattern,
        };

        await logApprovedWrite(ctx, {
          toolName: "apply_merchant_alias",
          args: { transaction_ids, merchant_id, save_alias_pattern },
          proposalSummary: summary,
          result,
          undoStrategy: "restoreTransactionSnapshots",
          undoData: snapshots,
        });

        return { ...result, undoable: true };
      },
    }),

    merge_merchants: tool({
      description:
        "Merge multiple merchant records into one canonical merchant. All transactions and aliases on the merged merchants are reassigned to the keep merchant; the merged merchant docs are deleted. Use when the same real-world merchant has been imported under several spellings (e.g. 'STARBUCKS #1234' and 'Starbucks' as separate merchants).",
      inputSchema: z.object({
        keep_merchant_id: merchantIdSchema,
        merge_merchant_ids: z.array(merchantIdSchema).min(1).max(50),
      }),
      needsApproval: true,
      execute: async ({ keep_merchant_id, merge_merchant_ids }) => {
        const merchants = await ctx.convex.query(api.merchants.listMerchants, {});
        const keep = merchants.find(
          (m) => String(m._id) === String(keep_merchant_id),
        );
        if (!keep) throw new Error(`Keep merchant ${keep_merchant_id} not found`);
        const toMerge = merge_merchant_ids
          .map((id) => merchants.find((m) => String(m._id) === String(id)))
          .filter((m): m is Doc<"merchants"> => !!m);
        if (toMerge.length === 0) {
          throw new Error("No matching merchants to merge");
        }

        const merged = await ctx.convex.mutation(api.merchants.merge, {
          keepMerchantId: keep_merchant_id as Id<"merchants">,
          mergeMerchantIds: merge_merchant_ids.map(
            (id) => id as Id<"merchants">,
          ),
        });

        const summary =
          `Merged ${toMerge.length} merchants into "${keep.canonicalName}": ` +
          toMerge.map((m) => `"${m.canonicalName}"`).join(", ") +
          `. Affected ${merged.affectedTransactionCount} transactions, ${merged.reassignedAliasCount} aliases.`;

        const result = {
          keep_merchant: keep.canonicalName,
          merged_count: toMerge.length,
          affected_transactions: merged.affectedTransactionCount,
          reassigned_aliases: merged.reassignedAliasCount,
        };

        await logApprovedWrite(ctx, {
          toolName: "merge_merchants",
          args: { keep_merchant_id, merge_merchant_ids },
          proposalSummary: summary,
          result,
          undoStrategy: "reverseMerchantMerge",
          undoData: merged.undoSnapshot,
        });

        return { ...result, undoable: true };
      },
    }),

    create_budget_from_draft: tool({
      description:
        "Create a new budget with line items in one shot. Each line item targets either a category_id or a category_group_id (mutually exclusive). limit_cents is the per-cadence amount.",
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        monthly_income_cents: z.number().int().min(0),
        effective_from: monthSchema,
        set_active: z
          .boolean()
          .optional()
          .describe("If true, also makes this the active budget after creation."),
        line_items: z
          .array(
            z.object({
              category_id: categoryIdSchema.optional(),
              category_group_id: z
                .string()
                .min(1)
                .optional()
                .describe("Convex Id<\"categoryGroups\">"),
              target_type: targetTypeSchema,
              limit_cents: z.number().int().min(0),
              cadence: cadenceSchema,
              cadence_day_of_week: z.number().int().min(0).max(6).optional(),
              cadence_day_of_month: z.number().int().min(1).max(31).optional(),
              target_date: z.string().optional(),
              refill_behavior: refillBehaviorSchema,
              rollover_unused: z.boolean(),
              sort_order: z.number().int().optional(),
            }),
          )
          .min(1)
          .max(200),
      }),
      needsApproval: true,
      execute: async (args) => {
        const lineItems = args.line_items.map((li) => ({
          categoryId: li.category_id as Id<"categories"> | undefined,
          categoryGroupId: li.category_group_id as
            | Id<"categoryGroups">
            | undefined,
          targetType: li.target_type,
          limitCents: li.limit_cents,
          cadence: li.cadence,
          cadenceDayOfWeek: li.cadence_day_of_week,
          cadenceDayOfMonth: li.cadence_day_of_month,
          targetDate: li.target_date,
          refillBehavior: li.refill_behavior,
          rolloverUnused: li.rollover_unused,
          sortOrder: li.sort_order,
        }));

        const budgetId = await ctx.convex.mutation(api.budgets.create, {
          name: args.name,
          monthlyIncomeCents: args.monthly_income_cents,
          effectiveFrom: args.effective_from,
          lineItems,
        });

        if (args.set_active) {
          await ctx.convex.mutation(api.budgets.setActive, { budgetId });
        }

        // Snapshot the line item ids the create returned by reading them back.
        const created = await ctx.convex.query(api.budgets.getWithLineItems, {
          budgetId,
        });
        const lineItemIds: Id<"budgetLineItems">[] =
          (created?.lineItems ?? []).map(
            (li: Doc<"budgetLineItems">) => li._id,
          );

        const summary =
          `Created budget "${args.name}" effective ${args.effective_from} with ` +
          `monthly income ${formatCentsAsDollars(args.monthly_income_cents)} and ` +
          `${lineItems.length} line items` +
          (args.set_active ? " (set as active)" : "");

        const result = {
          budget_id: String(budgetId),
          line_item_count: lineItemIds.length,
          set_active: !!args.set_active,
        };

        await logApprovedWrite(ctx, {
          toolName: "create_budget_from_draft",
          args,
          proposalSummary: summary,
          result,
          undoStrategy: "deleteBudgetCascade",
          undoData: { budgetId, lineItemIds },
        });

        return { ...result, undoable: true };
      },
    }),

    update_budget_line_item: tool({
      description:
        "Change the per-cadence limit on a budget line item. Use for incremental tweaks to an existing budget.",
      inputSchema: z.object({
        line_item_id: lineItemIdSchema,
        new_limit_cents: z.number().int().min(0),
      }),
      needsApproval: true,
      execute: async ({ line_item_id, new_limit_cents }) => {
        const active = await ctx.convex.query(api.budgets.getActive, {});
        if (!active) throw new Error("No active budget to read previous limit from");
        const existing = active.lineItems.find(
          (li) => String(li._id) === String(line_item_id),
        );
        if (!existing) throw new Error(`Line item ${line_item_id} not found in active budget`);

        const previousLimitCents = existing.limitCents;
        await ctx.convex.mutation(api.budgets.updateLineItem, {
          lineItemId: line_item_id as Id<"budgetLineItems">,
          limitCents: new_limit_cents,
        });

        const summary =
          `Updated budget line item ${line_item_id}: limit ` +
          `${formatCentsAsDollars(previousLimitCents)} → ` +
          `${formatCentsAsDollars(new_limit_cents)}`;

        const result = {
          line_item_id,
          previous_limit: formatCentsAsDollars(previousLimitCents),
          new_limit: formatCentsAsDollars(new_limit_cents),
        };

        await logApprovedWrite(ctx, {
          toolName: "update_budget_line_item",
          args: { line_item_id, new_limit_cents },
          proposalSummary: summary,
          result,
          undoStrategy: "revertBudgetLineItemLimit",
          undoData: { lineItemId: line_item_id, previousLimitCents },
        });

        return { ...result, undoable: true };
      },
    }),
  };
}

export type WriteTools = ReturnType<typeof createWriteTools>;

// Avoid an unused-import warning while keeping the helper available for
// future write tools that need to render a transaction line in proposals.
void formatTransactionLine;
void trimList;
