/**
 * Public AI-action audit + undo API.
 *
 * - `listRecent` / `get` — power the in-app audit drawer and the
 *   `list_recent_ai_actions` AI tool.
 * - `proposeWriteAction` / `recordDecision` — used by the chat route
 *   to log the approval lifecycle into the audit trail. Returns the
 *   action id so the chat surface can reference it later.
 * - `undo` — reverses an approved write using the strategy and undo
 *   snapshot recorded at apply time. Itself a write, so it also logs.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import {
  loadAiAction,
  logAutoToolCall,
  parseJson,
  proposeWrite,
  recordApproval,
  recordError,
  recordRejection,
  restoreTransactionSnapshot,
  type TransactionSnapshot,
} from "./lib/aiActions";
import {
  aiActionDecisionValidator,
  aiActionStatusValidator,
  aiActionSurfaceValidator,
  aiActionUndoStrategyValidator,
} from "./validators";

const actionRowValidator = v.object({
  _id: v.id("aiActions"),
  _creationTime: v.number(),
  surface: aiActionSurfaceValidator,
  sessionId: v.optional(v.string()),
  toolName: v.string(),
  argsJson: v.string(),
  proposalSummary: v.string(),
  decision: aiActionDecisionValidator,
  decisionAt: v.number(),
  status: aiActionStatusValidator,
  resultJson: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  undoStrategy: v.optional(aiActionUndoStrategyValidator),
  undoDataJson: v.optional(v.string()),
  undoneAt: v.optional(v.number()),
  requiresApproval: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    surface: v.optional(aiActionSurfaceValidator),
    sessionId: v.optional(v.string()),
    onlyWrites: v.optional(v.boolean()),
  },
  returns: v.array(actionRowValidator),
  handler: async (ctx, args): Promise<Doc<"aiActions">[]> => {
    assertSingleUserLocalMode();
    const limit = Math.min(args.limit ?? 50, 200);

    const baseQuery = args.surface
      ? ctx.db
          .query("aiActions")
          .withIndex("by_surface_decisionAt", (q) =>
            q.eq("surface", args.surface!),
          )
      : ctx.db.query("aiActions").withIndex("by_decisionAt");

    const ordered = baseQuery.order("desc");
    const rows = args.sessionId
      ? await ordered.collect()
      : await ordered.take(limit);

    let filtered: Doc<"aiActions">[] = rows;
    if (args.sessionId) {
      filtered = filtered.filter((r) => r.sessionId === args.sessionId);
    }
    if (args.onlyWrites) {
      filtered = filtered.filter((r) => r.requiresApproval);
    }
    return filtered.slice(0, limit);
  },
});

export const get = query({
  args: { id: v.id("aiActions") },
  returns: v.union(actionRowValidator, v.null()),
  handler: async (ctx, args): Promise<Doc<"aiActions"> | null> => {
    assertSingleUserLocalMode();
    return await ctx.db.get(args.id);
  },
});

/**
 * Insert a `pendingDecision` audit row for a write tool the model is
 * proposing. The chat surface then presents the proposal to the human and
 * calls `recordDecision` once they choose approve/reject.
 */
export const proposeWriteAction = mutation({
  args: {
    surface: aiActionSurfaceValidator,
    sessionId: v.optional(v.string()),
    toolName: v.string(),
    argsJson: v.string(),
    proposalSummary: v.string(),
  },
  returns: v.id("aiActions"),
  handler: async (ctx, args): Promise<Id<"aiActions">> => {
    assertSingleUserLocalMode();
    return await proposeWrite(ctx, {
      surface: args.surface,
      sessionId: args.sessionId,
      toolName: args.toolName,
      args: parseJson(args.argsJson) ?? args.argsJson,
      proposalSummary: args.proposalSummary,
    });
  },
});

/**
 * One-shot insert for the common write path: the human already approved
 * the tool call, the tool's `execute` ran, the Convex write succeeded.
 * Captures the result + undo data so the action can be reversed later.
 *
 * Prefer this over `proposeWriteAction` + `recordDecision` for the
 * happy path. Use the pair only when you need a row in `pendingDecision`
 * before the human has chosen (e.g. for a live audit drawer).
 */
export const logApprovedWrite = mutation({
  args: {
    surface: aiActionSurfaceValidator,
    sessionId: v.optional(v.string()),
    toolName: v.string(),
    argsJson: v.string(),
    proposalSummary: v.string(),
    resultJson: v.string(),
    undoStrategy: aiActionUndoStrategyValidator,
    undoDataJson: v.string(),
  },
  returns: v.id("aiActions"),
  handler: async (ctx, args): Promise<Id<"aiActions">> => {
    assertSingleUserLocalMode();
    const now = Date.now();
    return await ctx.db.insert("aiActions", {
      surface: args.surface,
      sessionId: args.sessionId,
      toolName: args.toolName,
      argsJson: args.argsJson,
      proposalSummary: args.proposalSummary,
      decision: "approved",
      decisionAt: now,
      status: "success",
      resultJson: args.resultJson,
      undoStrategy: args.undoStrategy,
      undoDataJson: args.undoDataJson,
      requiresApproval: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * One-shot insert for when the human rejected a proposed write before
 * any data was changed. No undo data because nothing happened.
 */
export const logRejection = mutation({
  args: {
    surface: aiActionSurfaceValidator,
    sessionId: v.optional(v.string()),
    toolName: v.string(),
    argsJson: v.string(),
    proposalSummary: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.id("aiActions"),
  handler: async (ctx, args): Promise<Id<"aiActions">> => {
    assertSingleUserLocalMode();
    const now = Date.now();
    return await ctx.db.insert("aiActions", {
      surface: args.surface,
      sessionId: args.sessionId,
      toolName: args.toolName,
      argsJson: args.argsJson,
      proposalSummary: args.proposalSummary,
      decision: "rejected",
      decisionAt: now,
      status: "rejected",
      errorMessage: args.reason,
      requiresApproval: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Log a non-write tool call (read tool) for observability. One-shot row,
 * never enters pending state.
 */
export const logAutoAction = mutation({
  args: {
    surface: aiActionSurfaceValidator,
    sessionId: v.optional(v.string()),
    toolName: v.string(),
    argsJson: v.string(),
    proposalSummary: v.string(),
    resultJson: v.string(),
  },
  returns: v.id("aiActions"),
  handler: async (ctx, args): Promise<Id<"aiActions">> => {
    assertSingleUserLocalMode();
    return await logAutoToolCall(ctx, {
      surface: args.surface,
      sessionId: args.sessionId,
      toolName: args.toolName,
      args: parseJson(args.argsJson) ?? args.argsJson,
      proposalSummary: args.proposalSummary,
      result: parseJson(args.resultJson) ?? args.resultJson,
    });
  },
});

/**
 * Called by the chat route once the human has approved or rejected a
 * pending write. `outcome` carries the apply result + undo data on
 * approval, or the rejection reason on denial.
 */
export const recordDecision = mutation({
  args: {
    actionId: v.id("aiActions"),
    decision: aiActionDecisionValidator,
    resultJson: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    undoStrategy: v.optional(aiActionUndoStrategyValidator),
    undoDataJson: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const action = await ctx.db.get(args.actionId);
    if (!action) throw new Error(`aiAction ${args.actionId} not found`);

    if (args.decision === "rejected") {
      await recordRejection(ctx, {
        actionId: args.actionId,
        reason: args.errorMessage,
      });
      return null;
    }

    if (args.decision === "approved") {
      if (args.errorMessage !== undefined) {
        await recordError(ctx, {
          actionId: args.actionId,
          error: args.errorMessage,
        });
        return null;
      }
      if (!args.undoStrategy) {
        throw new Error(
          "Approved writes must record an undoStrategy for auditability",
        );
      }
      await recordApproval(ctx, {
        actionId: args.actionId,
        result: parseJson(args.resultJson ?? "null") ?? null,
        undoStrategy: args.undoStrategy,
        undoData: parseJson(args.undoDataJson ?? "null") ?? null,
      });
      return null;
    }

    throw new Error(`Unsupported decision: ${args.decision}`);
  },
});

/**
 * Reverse a previously-approved write. Each `undoStrategy` knows how to
 * interpret its own `undoData` snapshot. Idempotent: re-undoing a row
 * that has already been undone is a no-op.
 */
export const undo = mutation({
  args: { actionId: v.id("aiActions") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const action = await loadAiAction(ctx, args.actionId);
    if (!action) throw new Error(`aiAction ${args.actionId} not found`);
    if (action.undoneAt !== undefined) return null;
    if (action.status !== "success") {
      throw new Error(
        `Cannot undo aiAction in status=${action.status}; only successful writes are reversible`,
      );
    }
    if (!action.undoStrategy) {
      throw new Error(
        "aiAction has no undoStrategy recorded; cannot undo automatically",
      );
    }

    switch (action.undoStrategy) {
      case "restoreTransactionSnapshots": {
        const snapshots =
          parseJson<TransactionSnapshot[]>(action.undoDataJson) ?? [];
        for (const snap of snapshots) {
          await restoreTransactionSnapshot(ctx, snap);
        }
        break;
      }
      case "revertBudgetLineItemLimit": {
        const snap = parseJson<{
          lineItemId: Id<"budgetLineItems">;
          previousLimitCents: number;
        }>(action.undoDataJson);
        if (!snap) break;
        const now = Date.now();
        await ctx.db.patch(snap.lineItemId, {
          limitCents: snap.previousLimitCents,
          updatedAt: now,
        });
        break;
      }
      case "deleteBudgetCascade": {
        const snap = parseJson<{
          budgetId: Id<"budgets">;
          lineItemIds: Id<"budgetLineItems">[];
        }>(action.undoDataJson);
        if (!snap) break;
        for (const lineItemId of snap.lineItemIds) {
          await ctx.db.delete(lineItemId);
        }
        await ctx.db.delete(snap.budgetId);
        break;
      }
      case "reverseMerchantMerge": {
        const snap = parseJson<{
          transactions: Array<{
            id: Id<"transactions">;
            merchantId?: Id<"merchants">;
            merchantName?: string;
          }>;
          restoredMerchants: Array<{
            doc: Omit<Doc<"merchants">, "_id" | "_creationTime">;
            aliases: Array<Omit<Doc<"merchantAliases">, "_id" | "_creationTime">>;
          }>;
        }>(action.undoDataJson);
        if (!snap) break;
        const now = Date.now();
        const newIdByCanonicalName = new Map<string, Id<"merchants">>();
        for (const m of snap.restoredMerchants) {
          const newId = await ctx.db.insert("merchants", {
            ...m.doc,
            createdAt: now,
            updatedAt: now,
          });
          newIdByCanonicalName.set(m.doc.canonicalName, newId);
          for (const alias of m.aliases) {
            await ctx.db.insert("merchantAliases", {
              ...alias,
              merchantId: newId,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
        for (const t of snap.transactions) {
          await ctx.db.patch(t.id, {
            merchantId: t.merchantId,
            merchantName: t.merchantName,
            updatedAt: now,
          });
        }
        break;
      }
      default: {
        const exhaustiveCheck: never = action.undoStrategy;
        throw new Error(`Unknown undoStrategy: ${String(exhaustiveCheck)}`);
      }
    }

    const now = Date.now();
    await ctx.db.patch(args.actionId, {
      status: "undone",
      undoneAt: now,
      updatedAt: now,
    });
    return null;
  },
});
