/**
 * Per-call context for every AI tool: which surface the model is talking
 * through (in-app chat vs. external MCP client), the chat session id (for
 * grouping audit rows), and an authed server-side Convex client.
 *
 * Constructed once per request in the chat route, and once at startup in
 * the MCP server (in which case `surface = "mcp"`).
 */

import { ConvexHttpClient } from "convex/browser";

export type ToolSurface = "inAppChat" | "mcp";

export interface ToolContext {
  surface: ToolSurface;
  sessionId?: string;
  convex: ConvexHttpClient;
}

export function createConvexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url || url.length === 0) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is required to instantiate the AI tool layer",
    );
  }
  return new ConvexHttpClient(url);
}
