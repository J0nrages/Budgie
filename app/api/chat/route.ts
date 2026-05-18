/**
 * Chat API route for the in-app Budgie assistant.
 *
 * Pattern: per-request agent (so we can thread `surface` + `sessionId`
 * into the audit-log tools) wired into the AI SDK v6 ToolLoopAgent and
 * served as a UI message stream via `createAgentUIStreamResponse`.
 *
 * Request body shape (sent by `useChat` from `@ai-sdk/react`):
 *   {
 *     messages: UIMessage[],
 *     sessionId?: string,     // optional, attached via useChat({ body })
 *     model?: string,         // optional, override the default OpenRouter model id
 *   }
 *
 * The route never accesses Convex directly — tools own all data IO so the
 * MCP server can reuse the exact same logic with zero duplication.
 */

import { createAgentUIStreamResponse } from "ai";
import { createBudgetAgent } from "@/lib/ai-tools/agent";

interface ChatRequestBody {
  messages: unknown[];
  sessionId?: string;
  model?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.messages)) {
    return Response.json(
      { error: "`messages` must be an array of UI messages" },
      { status: 400 },
    );
  }

  let agent;
  try {
    ({ agent } = createBudgetAgent({
      surface: "inAppChat",
      sessionId: body.sessionId,
      model: body.model,
    }));
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to initialize Budgie agent",
      },
      { status: 500 },
    );
  }

  return createAgentUIStreamResponse({
    agent,
    uiMessages: body.messages,
    abortSignal: request.signal,
  });
}
