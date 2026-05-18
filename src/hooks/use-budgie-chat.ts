"use client";

import { useMemo, useState } from "react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { Chat, useChat } from "@ai-sdk/react";
import { api } from "../../convex/_generated/api";
import { useMutation } from "convex/react";
import type { BudgetAgentUIMessage } from "@/lib/ai-tools/agent";

/**
 * Stable per-tab session id, regenerated on full reload. Threaded into
 * every chat request so audit-log rows can be grouped by conversation.
 */
function generateSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseBudgieChatResult {
  sessionId: string;
  chat: Chat<BudgetAgentUIMessage>;
  messages: BudgetAgentUIMessage[];
  status: ReturnType<typeof useChat<BudgetAgentUIMessage>>["status"];
  error: ReturnType<typeof useChat<BudgetAgentUIMessage>>["error"];
  sendUserText: (text: string) => void;
  stop: () => Promise<void>;
  /**
   * Approve a pending tool call. Logged to `aiActions` only via the tool's
   * own `logApprovedWrite` once `execute` runs server-side. We just call the
   * AI SDK approval response here.
   */
  approveToolCall: (approvalId: string) => Promise<void>;
  /**
   * Deny a pending tool call. Mirrors approve, plus logs a `rejected` row to
   * `aiActions` so the audit trail has a record even though no Convex write
   * ran on the server.
   */
  denyToolCall: (args: {
    approvalId: string;
    toolName: string;
    argsJson: string;
    proposalSummary: string;
    reason?: string;
  }) => Promise<void>;
}

export function useBudgieChat(): UseBudgieChatResult {
  const [sessionId] = useState<string>(() => generateSessionId());
  const logRejection = useMutation(api.aiActions.logRejection);

  const chat = useMemo(
    () =>
      new Chat<BudgetAgentUIMessage>({
        transport: new DefaultChatTransport({
          api: "/api/chat",
          body: { sessionId },
        }),
      }),
    [sessionId],
  );

  const { messages, status, error } = useChat<BudgetAgentUIMessage>({
    chat,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  return {
    sessionId,
    chat,
    messages,
    status,
    error,
    sendUserText: (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      void chat.sendMessage({ text: trimmed });
    },
    stop: () => chat.stop(),
    approveToolCall: async (approvalId: string) => {
      await chat.addToolApprovalResponse({
        id: approvalId,
        approved: true,
      });
    },
    denyToolCall: async ({
      approvalId,
      toolName,
      argsJson,
      proposalSummary,
      reason,
    }) => {
      try {
        await logRejection({
          surface: "inAppChat",
          sessionId,
          toolName,
          argsJson,
          proposalSummary,
          ...(reason ? { reason } : {}),
        });
      } catch {
        // Audit-log failure must not block the denial.
      }
      await chat.addToolApprovalResponse({
        id: approvalId,
        approved: false,
        ...(reason ? { reason } : {}),
      });
    },
  };
}
