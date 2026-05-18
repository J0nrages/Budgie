/**
 * MCP server that exposes the Budgie tool layer over stdio for external
 * AI clients (Claude Desktop, Cursor, ChatGPT desktop, etc.).
 *
 * Same TypeScript tool functions as the in-app chat — only the protocol
 * adapter differs. Read tools have `readOnlyHint: true`. Write tools have
 * `destructiveHint: true` so the MCP client's UI knows to prompt the
 * human for confirmation before running them.
 *
 * Audit-log rows are written by the underlying tool functions through
 * `aiActions.logApprovedWrite` / `logRejection` / `logAutoAction`, with
 * `surface: "mcp"` so MCP-originated actions are distinguishable from
 * in-app chat actions in `listRecent`.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "ai";
import { z } from "zod";
import {
  createConvexClient,
  type ToolContext,
} from "../src/lib/ai-tools/context";
import { createReadTools } from "../src/lib/ai-tools/read-tools";
import { createWriteTools } from "../src/lib/ai-tools/write-tools";

const WRITE_TOOL_NAMES = new Set([
  "reclassify_as_transfer",
  "set_transaction_category",
  "apply_merchant_alias",
  "merge_merchants",
  "create_budget_from_draft",
  "update_budget_line_item",
]);

type ToolMap = Record<string, Tool>;

function getZodShape(t: Tool): Record<string, z.ZodTypeAny> | undefined {
  const schema = t.inputSchema as unknown;
  if (!schema || typeof schema !== "object") return undefined;
  const asObject = schema as z.ZodObject<z.ZodRawShape> & { shape?: unknown };
  if (asObject.shape && typeof asObject.shape === "object") {
    return asObject.shape as Record<string, z.ZodTypeAny>;
  }
  return undefined;
}

export function buildBudgetMcpServer(sessionId?: string): McpServer {
  const ctx: ToolContext = {
    surface: "mcp",
    sessionId,
    convex: createConvexClient(),
  };

  const allTools: ToolMap = {
    ...createReadTools(ctx),
    ...createWriteTools(ctx),
  };

  const server = new McpServer(
    {
      name: "budgeter-budgie",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    },
  );

  for (const [toolName, t] of Object.entries(allTools)) {
    const isWrite = WRITE_TOOL_NAMES.has(toolName);
    const shape = getZodShape(t) ?? {};
    const description = t.description ?? toolName;

    server.registerTool(
      toolName,
      {
        title: humanizeToolName(toolName),
        description,
        inputSchema: shape,
        annotations: {
          title: humanizeToolName(toolName),
          readOnlyHint: !isWrite,
          destructiveHint: isWrite,
          idempotentHint: !isWrite,
          openWorldHint: false,
        },
      },
      async (args, _extra) => {
        const execute = t.execute as ((
          input: unknown,
          opts?: unknown,
        ) => Promise<unknown>) | undefined;
        if (!execute) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Tool ${toolName} has no execute function`,
              },
            ],
          };
        }
        try {
          const result = await execute(args, {
            toolCallId: `mcp-${Date.now()}`,
            messages: [],
          });
          return {
            content: [
              {
                type: "text" as const,
                text:
                  typeof result === "string"
                    ? result
                    : JSON.stringify(result, null, 2),
              },
            ],
            structuredContent:
              typeof result === "object" && result !== null
                ? (result as Record<string, unknown>)
                : undefined,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error running ${toolName}: ${message}`,
              },
            ],
          };
        }
      },
    );
  }

  return server;
}

function humanizeToolName(name: string): string {
  return name
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
