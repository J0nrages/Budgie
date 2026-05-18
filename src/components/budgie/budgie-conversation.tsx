"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, StopCircle, User2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useBudgieChat } from "@/hooks/use-budgie-chat";
import { BudgieToolPart } from "./budgie-message-parts";
import type { BudgetAgentUIMessage } from "@/lib/ai-tools/agent";

export function BudgieConversation() {
  const chat = useBudgieChat();
  const { messages, status, error, sendUserText, stop, approveToolCall, denyToolCall } = chat;
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const isStreaming = status === "submitted" || status === "streaming";

  const onSubmit = () => {
    const text = draft.trim();
    if (text.length === 0 || isStreaming) return;
    sendUserText(text);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2 px-1 pb-1">
        <Sparkles className="size-4 text-primary" />
        <p className="text-sm font-medium">Budgie</p>
        <p className="ml-auto font-mono text-[10px] text-muted-foreground">
          session {chat.sessionId.slice(0, 8)}
        </p>
      </div>
      <Separator />

      <ScrollArea className="flex-1 pr-2" ref={scrollRef as never}>
        <div className="space-y-4 pb-4">
          {messages.length === 0 ? <EmptyState /> : null}
          {messages.map((m) => (
            <BudgieMessage
              key={m.id}
              message={m}
              onApprove={approveToolCall}
              onDeny={denyToolCall}
            />
          ))}
          {isStreaming ? (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {status === "submitted" ? "Thinking…" : "Replying…"}
            </div>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Chat error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t pt-3">
        <Textarea
          rows={3}
          placeholder="Ask anything about your accounts, spending, or budget…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to send</p>
          <div className="flex gap-2">
            {isStreaming ? (
              <Button size="sm" variant="outline" onClick={() => void stop()}>
                <StopCircle className="mr-1 size-3.5" /> Stop
              </Button>
            ) : null}
            <Button size="sm" onClick={onSubmit} disabled={draft.trim().length === 0 || isStreaming}>
              <Send className="mr-1 size-3.5" /> Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Try asking Budgie:</p>
      <ul className="mt-2 list-inside list-disc space-y-1">
        <li>How much did I spend by category over the last two months?</li>
        <li>What are my recurring monthly subscriptions?</li>
        <li>What does my paycheck cadence look like across accounts?</li>
        <li>Draft a budget I could share with my spouse based on my last 3 months.</li>
        <li>Reclassify the recent Affirm Card transfers from Capital One as transfers.</li>
      </ul>
      <p className="mt-3 text-xs">
        Budgie can also propose writes — categorizing transactions, merging merchants,
        creating budgets. Every write asks for your approval first and is logged for undo.
      </p>
    </div>
  );
}

function BudgieMessage({
  message,
  onApprove,
  onDeny,
}: {
  message: BudgetAgentUIMessage;
  onApprove: (approvalId: string) => Promise<void> | void;
  onDeny: (args: {
    approvalId: string;
    toolName: string;
    argsJson: string;
    proposalSummary: string;
  }) => Promise<void> | void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="size-3.5" />
        </div>
      ) : null}
      <div
        className={cn(
          "flex max-w-[88%] flex-col gap-2",
          isUser ? "items-end" : "items-start",
        )}
      >
        {message.parts.map((part, idx) => {
          if (part.type === "text") {
            return (
              <div
                key={`${message.id}-text-${idx}`}
                className={cn(
                  "whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {part.text}
              </div>
            );
          }
          if (part.type === "reasoning") {
            return (
              <details
                key={`${message.id}-reasoning-${idx}`}
                className="w-full rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              >
                <summary className="cursor-pointer select-none font-medium">
                  Reasoning
                </summary>
                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">
                  {(part as { text?: string }).text ?? ""}
                </p>
              </details>
            );
          }
          if (part.type.startsWith("tool-")) {
            return (
              <BudgieToolPart
                key={`${message.id}-tool-${idx}`}
                part={part as never}
                onApprove={onApprove}
                onDeny={onDeny}
              />
            );
          }
          return null;
        })}
      </div>
      {isUser ? (
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User2 className="size-3.5" />
        </div>
      ) : null}
    </div>
  );
}
