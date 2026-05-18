/**
 * Read-only AI tools. Each wraps an existing Convex query, formats the
 * result for the model (cents → dollars, dates as ISO strings), and logs
 * one row to `aiActions` with `decision: "auto"` for observability.
 *
 * No tool here should ever cause a write. Adding a write is the same as
 * adding a new exported tool — put it in `write-tools.ts` instead.
 */

import { tool } from "ai";
import { z } from "zod";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import type { ToolContext } from "./context";
import {
  formatCentsAsDollars,
  formatIsoDateRange,
  trimList,
} from "./formatters";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date (YYYY-MM-DD)");

const month = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Must be a year-month (YYYY-MM)");

const accountIdSchema = z
  .string()
  .min(1)
  .describe("Convex Id<\"accounts\"> — get one from list_accounts");

const budgetIdSchema = z
  .string()
  .min(1)
  .describe("Convex Id<\"budgets\"> — get one from list_budgets or get_active_budget");

async function logRead(
  ctx: ToolContext,
  toolName: string,
  args: unknown,
  summary: string,
  result: unknown,
): Promise<void> {
  try {
    await ctx.convex.mutation(api.aiActions.logAutoAction, {
      surface: ctx.surface,
      sessionId: ctx.sessionId,
      toolName,
      argsJson: JSON.stringify(args ?? {}),
      proposalSummary: summary,
      resultJson: JSON.stringify(result ?? null),
    });
  } catch {
    // Audit logging must never break a tool call.
  }
}

export function createReadTools(ctx: ToolContext) {
  return {
    get_category_totals: tool({
      description:
        "Total spend per category between two dates. Transfers between accounts are excluded automatically. Use when the human asks about category-level spending across one or more months.",
      inputSchema: z.object({
        start_date: isoDate.describe("Inclusive start date (YYYY-MM-DD)"),
        end_date: isoDate.describe("Inclusive end date (YYYY-MM-DD)"),
        account_id: accountIdSchema.optional(),
      }),
      execute: async ({ start_date, end_date, account_id }) => {
        const rows = await ctx.convex.query(
          api.reports.categoryTotalsInRange,
          {
            startDate: start_date,
            endDate: end_date,
            ...(account_id ? { accountId: account_id as Id<"accounts"> } : {}),
          },
        );
        const formatted = rows.map((r) => ({
          category: r.category,
          total: formatCentsAsDollars(r.totalCents),
          totalCents: r.totalCents,
          count: r.count,
        }));
        const summary = `Category totals for ${formatIsoDateRange(
          start_date,
          end_date,
        )} — ${rows.length} categories`;
        const result = { range: { start_date, end_date }, rows: formatted };
        await logRead(ctx, "get_category_totals", { start_date, end_date, account_id }, summary, result);
        return result;
      },
    }),

    get_merchant_totals: tool({
      description:
        "Top merchants by absolute spend between two dates. Transfers are excluded. Use to identify what's driving a category, or to find subscription-style spend by merchant.",
      inputSchema: z.object({
        start_date: isoDate,
        end_date: isoDate,
        account_id: accountIdSchema.optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Max merchants to return (default 25)"),
      }),
      execute: async ({ start_date, end_date, account_id, limit }) => {
        const rows = await ctx.convex.query(
          api.reports.merchantTotalsInRange,
          {
            startDate: start_date,
            endDate: end_date,
            ...(account_id ? { accountId: account_id as Id<"accounts"> } : {}),
            ...(limit !== undefined ? { limit } : { limit: 25 }),
          },
        );
        const formatted = rows.map((r) => ({
          merchant: r.merchantName,
          total: formatCentsAsDollars(r.totalCents),
          totalCents: r.totalCents,
          count: r.count,
        }));
        const summary = `Merchant totals for ${formatIsoDateRange(
          start_date,
          end_date,
        )} — top ${formatted.length}`;
        const result = { range: { start_date, end_date }, rows: formatted };
        await logRead(ctx, "get_merchant_totals", { start_date, end_date, account_id, limit }, summary, result);
        return result;
      },
    }),

    detect_monthly_income: tool({
      description:
        "Detect the user's recurring monthly take-home income from posted deposits. Identifies weekly, biweekly, and semi-monthly payroll patterns across all accounts. Use when asked about income, paycheck cadence, or household take-home.",
      inputSchema: z.object({
        months: z
          .number()
          .int()
          .min(1)
          .max(36)
          .optional()
          .describe("Lookback window in months (default 6)"),
      }),
      execute: async ({ months }) => {
        const result = await ctx.convex.query(api.budgetReports.detectMonthlyIncome, {
          ...(months !== undefined ? { months } : {}),
        });
        const formatted = {
          suggested_monthly_income: formatCentsAsDollars(result.suggestedMonthlyIncomeCents),
          suggested_monthly_income_cents: result.suggestedMonthlyIncomeCents,
          income_samples: result.samples,
          window_end_month: result.windowEndMonth ?? null,
        };
        const summary = `Detected monthly income ≈ ${formatted.suggested_monthly_income} from ${result.samples} samples`;
        await logRead(ctx, "detect_monthly_income", { months }, summary, formatted);
        return formatted;
      },
    }),

    detect_recurring_bills: tool({
      description:
        "Identify recurring bills (subscriptions, utilities, services) by merchant from the past N months. Returns average amount, last amount, occurrence count, and confidence. Use to find subscription-style spend.",
      inputSchema: z.object({
        months: z
          .number()
          .int()
          .min(1)
          .max(36)
          .optional()
          .describe("Lookback window in months (default 6)"),
      }),
      execute: async ({ months }) => {
        const rows = await ctx.convex.query(
          api.budgetReports.detectRecurringBills,
          months !== undefined ? { months } : {},
        );
        const formatted = rows.map((r) => ({
          merchant: r.merchantName ?? r.key,
          category: r.category ?? null,
          average_amount: formatCentsAsDollars(r.averageAmountCents),
          average_amount_cents: r.averageAmountCents,
          last_amount: formatCentsAsDollars(r.lastAmountCents),
          last_amount_cents: r.lastAmountCents,
          occurrence_count: r.occurrenceCount,
          last_date: r.lastDate,
          confidence: r.confidence,
        }));
        const summary = `Detected ${rows.length} recurring bills`;
        await logRead(ctx, "detect_recurring_bills", { months }, summary, formatted);
        return formatted;
      },
    }),

    get_waterfall_summary: tool({
      description:
        "Rocket Money-style waterfall: budgeted income → fixed bills → flexible spend → savings for a given month and budget. Returns per-tier budgeted and actual amounts plus any unbudgeted spend.",
      inputSchema: z.object({
        budget_id: budgetIdSchema,
        month: month.describe("Budget month (YYYY-MM)"),
        as_of_date: isoDate.optional(),
      }),
      execute: async ({ budget_id, month: m, as_of_date }) => {
        const result = await ctx.convex.query(api.budgetReports.waterfallSummary, {
          budgetId: budget_id as Id<"budgets">,
          month: m,
          ...(as_of_date ? { asOfDate: as_of_date } : {}),
        });
        const totalActual = result.tiers.reduce(
          (sum, t) => sum + t.actualCents,
          0,
        );
        const summary = `Waterfall for ${m}: income ${formatCentsAsDollars(
          result.monthlyIncomeCents,
        )} → tracked spend ${formatCentsAsDollars(totalActual)}`;
        await logRead(ctx, "get_waterfall_summary", { budget_id, month: m, as_of_date }, summary, result);
        return formatForModel(result);
      },
    }),

    get_monthly_budget_vs_actual: tool({
      description:
        "Per-line-item budget vs. actual spend for a given month. Returns each line's limit, actual, percent used, and pace status. Use when asked which lines are over/under budget for a month.",
      inputSchema: z.object({
        budget_id: budgetIdSchema,
        month: month.describe("Budget month (YYYY-MM)"),
        as_of_date: isoDate.optional(),
      }),
      execute: async ({ budget_id, month: m, as_of_date }) => {
        const result = await ctx.convex.query(
          api.budgetReports.monthlyBudgetVsActual,
          {
            budgetId: budget_id as Id<"budgets">,
            month: m,
            ...(as_of_date ? { asOfDate: as_of_date } : {}),
          },
        );
        const summary = `Budget vs actual for ${m}`;
        await logRead(ctx, "get_monthly_budget_vs_actual", { budget_id, month: m, as_of_date }, summary, result);
        return formatForModel(result);
      },
    }),

    get_budget_trend: tool({
      description:
        "Historical budget vs actual for the past N months. Use for trend analysis (is spend trending up over time?).",
      inputSchema: z.object({
        budget_id: budgetIdSchema,
        months: z.number().int().min(1).max(36).optional(),
      }),
      execute: async ({ budget_id, months }) => {
        const result = await ctx.convex.query(
          api.budgetReports.budgetTrendHistory,
          {
            budgetId: budget_id as Id<"budgets">,
            ...(months !== undefined ? { months } : {}),
          },
        );
        const summary = `Budget trend over ${months ?? "default"} months`;
        await logRead(ctx, "get_budget_trend", { budget_id, months }, summary, result);
        return formatForModel(result);
      },
    }),

    get_historical_averages: tool({
      description:
        "Average per-category spend over the last N months. Useful as a starting point when proposing a new budget.",
      inputSchema: z.object({
        months: z.number().int().min(1).max(36).optional(),
      }),
      execute: async ({ months }) => {
        const result = await ctx.convex.query(
          api.budgets.historicalAverages,
          months !== undefined ? { months } : {},
        );
        const summary = `Historical averages over ${months ?? "default"} months`;
        await logRead(ctx, "get_historical_averages", { months }, summary, result);
        return formatForModel(result);
      },
    }),

    list_accounts: tool({
      description:
        "List all accounts (assets and liabilities). Returns ids, names, types, subtypes, issuers, and last-four. Use to discover account_id values before calling other tools.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await ctx.convex.query(api.accounts.list, {});
        const formatted = rows.map((a) => ({
          id: a._id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          issuer: a.issuer ?? null,
          institution: a.institution ?? null,
          last_four: a.lastFour ?? null,
          credit_limit: a.creditLimitCents !== undefined ? formatCentsAsDollars(a.creditLimitCents) : null,
          apr_bps: a.aprBps ?? null,
        }));
        await logRead(ctx, "list_accounts", {}, `Listed ${formatted.length} accounts`, formatted);
        return formatted;
      },
    }),

    list_transactions: tool({
      description:
        "List individual transactions, most recent first. Filter by account if known. For aggregate analysis, prefer get_category_totals or get_merchant_totals instead.",
      inputSchema: z.object({
        account_id: accountIdSchema.optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
      execute: async ({ account_id, limit }) => {
        const rows = await ctx.convex.query(api.transactions.list, {
          ...(account_id ? { accountId: account_id as Id<"accounts"> } : {}),
          ...(limit !== undefined ? { limit } : { limit: 50 }),
        });
        const accounts = await ctx.convex.query(api.accounts.list, {});
        const acctName = new Map(accounts.map((a) => [a._id, a.name]));
        const formatted = rows.map((t) => ({
          id: t._id,
          incurred_date: t.incurredDate,
          posted_date: t.postedDate ?? null,
          type: t.type,
          amount: formatCentsAsDollars(t.amountCents),
          amount_cents: t.amountCents,
          description: t.description,
          merchant: t.merchantName ?? null,
          category: t.category ?? null,
          account: t.accountId ? acctName.get(t.accountId) ?? null : null,
          from_account: t.fromAccountId ? acctName.get(t.fromAccountId) ?? null : null,
          to_account: t.toAccountId ? acctName.get(t.toAccountId) ?? null : null,
          posting_status: t.postingStatus ?? null,
        }));
        const { shown, truncated } = trimList(formatted, 100);
        const summary = `Listed ${shown.length} transactions${truncated ? ` (${truncated} more truncated)` : ""}`;
        await logRead(ctx, "list_transactions", { account_id, limit }, summary, { rows: shown, truncated });
        return { rows: shown, truncated };
      },
    }),

    list_budgets: tool({
      description: "List all budgets in the workspace. Returns id, name, isActive, monthlyIncomeCents, and effective dates.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await ctx.convex.query(api.budgets.list, {});
        const formatted = rows.map((b) => ({
          id: b._id,
          name: b.name,
          is_active: b.isActive,
          monthly_income: formatCentsAsDollars(b.monthlyIncomeCents),
          monthly_income_cents: b.monthlyIncomeCents,
          effective_from: b.effectiveFrom,
          effective_to: b.effectiveTo ?? null,
        }));
        await logRead(ctx, "list_budgets", {}, `Listed ${formatted.length} budgets`, formatted);
        return formatted;
      },
    }),

    get_active_budget: tool({
      description: "Return the currently-active budget with its line items (or null). Useful before calling per-budget tools.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await ctx.convex.query(api.budgets.getActive, {});
        const formatted = result
          ? {
              id: result.budget._id,
              name: result.budget.name,
              monthly_income: formatCentsAsDollars(result.budget.monthlyIncomeCents),
              monthly_income_cents: result.budget.monthlyIncomeCents,
              effective_from: result.budget.effectiveFrom,
              effective_to: result.budget.effectiveTo ?? null,
              line_item_count: result.lineItems.length,
              line_items: result.lineItems.map((li) => ({
                id: li._id,
                category_id: li.categoryId ?? null,
                category_group_id: li.categoryGroupId ?? null,
                target_type: li.targetType,
                limit: formatCentsAsDollars(li.limitCents),
                limit_cents: li.limitCents,
                cadence: li.cadence,
                rollover_unused: li.rolloverUnused,
              })),
            }
          : null;
        await logRead(ctx, "get_active_budget", {}, "Fetched active budget", formatted);
        return formatted;
      },
    }),

    get_budget_with_line_items: tool({
      description: "Full budget detail including every line item (category, cadence, limit, rollover behavior).",
      inputSchema: z.object({
        budget_id: budgetIdSchema,
      }),
      execute: async ({ budget_id }) => {
        const result = await ctx.convex.query(api.budgets.getWithLineItems, {
          budgetId: budget_id as Id<"budgets">,
        });
        await logRead(ctx, "get_budget_with_line_items", { budget_id }, `Loaded budget ${budget_id}`, result);
        return formatForModel(result);
      },
    }),

    list_categories: tool({
      description: "List all spending categories grouped by category group (waterfall tier). Use to discover category_id values for write tools.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await ctx.convex.query(api.categories.listAll, {});
        await logRead(ctx, "list_categories", {}, "Listed categories", result);
        return result;
      },
    }),

    list_merchants: tool({
      description: "List all known merchants (canonical name + normalized key + optional logo domain).",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await ctx.convex.query(api.merchants.listMerchants, {});
        const formatted = rows.map((m) => ({
          id: m._id,
          canonical_name: m.canonicalName,
          normalized_key: m.normalizedKey,
          logo_domain: m.logoDomain ?? null,
        }));
        await logRead(ctx, "list_merchants", {}, `Listed ${formatted.length} merchants`, formatted);
        return formatted;
      },
    }),

    list_recent_ai_actions: tool({
      description:
        "Recent AI-driven tool calls (read + approved writes + rejected proposals) with their outcomes. Use when the human asks 'what did you do?' or 'what did I approve?' across sessions.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional(),
        only_writes: z.boolean().optional(),
      }),
      execute: async ({ limit, only_writes }) => {
        const rows = await ctx.convex.query(api.aiActions.listRecent, {
          ...(limit !== undefined ? { limit } : {}),
          ...(only_writes !== undefined ? { onlyWrites: only_writes } : {}),
        });
        const formatted = rows.map((r) => ({
          id: r._id,
          tool: r.toolName,
          surface: r.surface,
          decision: r.decision,
          status: r.status,
          summary: r.proposalSummary,
          at: new Date(r.decisionAt).toISOString(),
          undone: r.undoneAt !== undefined,
        }));
        return formatted;
      },
    }),
  };
}

export type ReadTools = ReturnType<typeof createReadTools>;

/** Convex result objects can contain Convex Ids; the AI SDK serializes via JSON.stringify, which is fine. */
function formatForModel<T>(value: T): T {
  return value;
}
