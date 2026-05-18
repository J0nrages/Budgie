/**
 * Audit-log helpers for AI-initiated tool calls.
 *
 * Every AI tool (read or write) routes through here so we have a single,
 * queryable history of: what was proposed, what the human decided, what
 * actually happened, and how to undo it. Read tools insert a single row in
 * one step. Write tools insert a `pendingDecision` row, then update it with
 * the decision and outcome.
 *
 * Designed to be called from internal mutations / actions only — public
 * surfaces should go through `convex/aiActions.ts`.
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Surface = Doc<"aiActions">["surface"];
type UndoStrategy = NonNullable<Doc<"aiActions">["undoStrategy"]>;

export interface LogAutoToolCallArgs {
  surface: Surface;
  sessionId?: string;
  toolName: string;
  args: unknown;
  proposalSummary: string;
  result: unknown;
}

/**
 * Log a read tool or an auto-approved write. One row, terminal status.
 * Used for observability only — no approval gate, no undo data.
 */
export async function logAutoToolCall(
  ctx: MutationCtx,
  input: LogAutoToolCallArgs,
): Promise<Id<"aiActions">> {
  const now = Date.now();
  return await ctx.db.insert("aiActions", {
    surface: input.surface,
    sessionId: input.sessionId,
    toolName: input.toolName,
    argsJson: safeStringify(input.args),
    proposalSummary: input.proposalSummary,
    decision: "auto",
    decisionAt: now,
    status: "success",
    resultJson: safeStringify(input.result),
    requiresApproval: false,
    createdAt: now,
    updatedAt: now,
  });
}

export interface ProposeWriteArgs {
  surface: Surface;
  sessionId?: string;
  toolName: string;
  args: unknown;
  proposalSummary: string;
}

/** Insert a row in `pendingDecision` state for a write tool that needs approval. */
export async function proposeWrite(
  ctx: MutationCtx,
  input: ProposeWriteArgs,
): Promise<Id<"aiActions">> {
  const now = Date.now();
  return await ctx.db.insert("aiActions", {
    surface: input.surface,
    sessionId: input.sessionId,
    toolName: input.toolName,
    argsJson: safeStringify(input.args),
    proposalSummary: input.proposalSummary,
    decision: "approved", // placeholder until the human decides; status pendingDecision is the truth
    decisionAt: now,
    status: "pendingDecision",
    requiresApproval: true,
    createdAt: now,
    updatedAt: now,
  });
}

export interface RecordApprovalArgs {
  actionId: Id<"aiActions">;
  result: unknown;
  undoStrategy: UndoStrategy;
  undoData: unknown;
}

/** Mark a proposed action as approved + successfully executed. */
export async function recordApproval(
  ctx: MutationCtx,
  input: RecordApprovalArgs,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(input.actionId, {
    decision: "approved",
    decisionAt: now,
    status: "success",
    resultJson: safeStringify(input.result),
    undoStrategy: input.undoStrategy,
    undoDataJson: safeStringify(input.undoData),
    updatedAt: now,
  });
}

export interface RecordRejectionArgs {
  actionId: Id<"aiActions">;
  reason?: string;
}

export async function recordRejection(
  ctx: MutationCtx,
  input: RecordRejectionArgs,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(input.actionId, {
    decision: "rejected",
    decisionAt: now,
    status: "rejected",
    errorMessage: input.reason,
    updatedAt: now,
  });
}

export interface RecordErrorArgs {
  actionId: Id<"aiActions">;
  error: string;
}

export async function recordError(
  ctx: MutationCtx,
  input: RecordErrorArgs,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(input.actionId, {
    status: "error",
    errorMessage: input.error,
    updatedAt: now,
  });
}

/** Read tool helper — pulls the action and parses its JSON fields. */
export async function loadAiAction(
  ctx: QueryCtx,
  actionId: Id<"aiActions">,
): Promise<Doc<"aiActions"> | null> {
  return await ctx.db.get(actionId);
}

export function parseJson<T>(value: string | undefined): T | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ __unserializable: true });
  }
}

/**
 * Snapshot of a transaction's mutable fields, sufficient for restoring
 * after a write tool changed them. Stored as `undoData` for the
 * `restoreTransactionSnapshots` strategy.
 */
export interface TransactionSnapshot {
  id: Id<"transactions">;
  type: Doc<"transactions">["type"];
  amountCents: number;
  accountId?: Id<"accounts">;
  fromAccountId?: Id<"accounts">;
  toAccountId?: Id<"accounts">;
  category?: string;
  merchantId?: Id<"merchants">;
  merchantName?: string;
  description: string;
}

export function snapshotTransaction(
  doc: Doc<"transactions">,
): TransactionSnapshot {
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

export async function restoreTransactionSnapshot(
  ctx: MutationCtx,
  snapshot: TransactionSnapshot,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(snapshot.id, {
    type: snapshot.type,
    amountCents: snapshot.amountCents,
    accountId: snapshot.accountId,
    fromAccountId: snapshot.fromAccountId,
    toAccountId: snapshot.toAccountId,
    category: snapshot.category,
    merchantId: snapshot.merchantId,
    merchantName: snapshot.merchantName,
    description: snapshot.description,
    updatedAt: now,
  });
}
