#!/usr/bin/env bun
/**
 * Budgie MCP stdio server.
 *
 * Run with:
 *   bun mcp/index.ts
 *
 * Add to an MCP client config (e.g. Claude Desktop, Cursor) like:
 *   {
 *     "mcpServers": {
 *       "budgie": {
 *         "command": "bun",
 *         "args": ["mcp/index.ts"],
 *         "cwd": "/absolute/path/to/this/repo",
 *         "env": {
 *           "NEXT_PUBLIC_CONVEX_URL": "https://your-deployment.convex.cloud"
 *         }
 *       }
 *     }
 *   }
 *
 * Requires the Convex dev backend to be running (`bun run dev`) so the
 * tool layer can talk to your local database.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildBudgetMcpServer } from "./server";

async function main(): Promise<void> {
  const sessionId =
    process.env.BUDGIE_MCP_SESSION_ID ?? `mcp-${Date.now().toString(36)}`;
  const server = buildBudgetMcpServer(sessionId);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The transport keeps the process alive until the client disconnects.
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[budgie-mcp] fatal:", err);
  process.exit(1);
});
