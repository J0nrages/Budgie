/**
 * The Budgie ToolLoopAgent. Composes all read + write tools and binds
 * them to the selected OpenRouter model. Used by both the in-app chat
 * route (`app/api/chat/route.ts`) and the MCP server wrapper.
 *
 * Why an agent and not raw `streamText`?
 *   - The agent abstraction (`ToolLoopAgent`) handles the multi-step
 *     tool execution loop natively, including the approval pause/resume
 *     dance that `needsApproval: true` triggers.
 *   - The same definition can be re-used for cron-scheduled briefings
 *     in Phase 3 without re-wiring tools.
 */

import { ToolLoopAgent, type InferAgentUIMessage, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createConvexClient, type ToolContext } from "./context";
import { createReadTools } from "./read-tools";
import { createWriteTools } from "./write-tools";

const DEFAULT_MODEL =
  process.env.AI_DEFAULT_MODEL?.trim() || "anthropic/claude-sonnet-4.5";

const SYSTEM_INSTRUCTIONS = `You are Budgie, the user's personal-finance assistant for their Budgeter app.

You have read access to the user's full ledger across all connected accounts
(transactions, categories, merchants, budgets) and write access to a small
set of tools for cleaning up data and editing budgets. Every write tool
requires explicit human approval before it runs.

Rules:
- Always ground numerical answers in tool calls. Never estimate or recall
  numbers from memory when a tool can fetch them.
- All money is stored as integer cents. Tools format cents → dollars for
  display, but pass cents to tools that expect them.
- Dates are ISO (YYYY-MM-DD); months are YYYY-MM.
- For category/merchant/income/recurring-bill questions, prefer the
  aggregate tools (get_category_totals, get_merchant_totals,
  detect_monthly_income, detect_recurring_bills) over listing transactions.
- For write actions, propose ONE specific change at a time. The user will
  see an approval card with the exact args before it runs. Explain what
  you are about to do in plain English before calling the tool.
- When a write is rejected, do not retry the same call. Acknowledge and
  ask what to do differently.
- If you produce a budget recommendation, structure it as: monthly net
  income → fixed bills → variable spending → savings, and explicitly call
  out anything that looks incomplete (missing rent/groceries, uncategorized
  transfers, debt drag, etc.).`;

export interface CreateAgentArgs {
  /** Where the request is coming from. Threaded into the audit log. */
  surface: ToolContext["surface"];
  /** Chat session id, used to group audit rows. */
  sessionId?: string;
  /** Override the default model (e.g. for a power-user "smarter mode"). */
  model?: string;
}

export function createBudgetAgent(args: CreateAgentArgs) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new Error(
      "OPENROUTER_API_KEY is required. Get one at https://openrouter.ai/keys and add it to .env.local",
    );
  }

  const openrouter = createOpenRouter({ apiKey });
  const ctx: ToolContext = {
    surface: args.surface,
    sessionId: args.sessionId,
    convex: createConvexClient(),
  };

  const tools = {
    ...createReadTools(ctx),
    ...createWriteTools(ctx),
  };

  const agent = new ToolLoopAgent({
    model: openrouter.chat(args.model ?? DEFAULT_MODEL),
    instructions: SYSTEM_INSTRUCTIONS,
    tools,
    stopWhen: stepCountIs(12),
  });

  return { agent, ctx, tools };
}

export type BudgetAgent = ReturnType<typeof createBudgetAgent>["agent"];
export type BudgetAgentUIMessage = InferAgentUIMessage<BudgetAgent>;
