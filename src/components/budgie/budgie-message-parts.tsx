"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { BudgetAgentUIMessage } from "@/lib/ai-tools/agent";

type ToolPart = Extract<
  BudgetAgentUIMessage["parts"][number],
  { type: `tool-${string}` }
>;

const WRITE_TOOL_NAMES = new Set([
  "reclassify_as_transfer",
  "set_transaction_category",
  "apply_merchant_alias",
  "merge_merchants",
  "create_budget_from_draft",
  "update_budget_line_item",
]);

const TOOL_LABELS: Record<string, string> = {
  get_category_totals: "Category totals",
  get_merchant_totals: "Merchant totals",
  detect_monthly_income: "Detect monthly income",
  detect_recurring_bills: "Detect recurring bills",
  get_waterfall_summary: "Waterfall summary",
  get_monthly_budget_vs_actual: "Budget vs actual",
  get_budget_trend: "Budget trend",
  get_historical_averages: "Historical averages",
  list_accounts: "List accounts",
  list_transactions: "List transactions",
  list_budgets: "List budgets",
  get_active_budget: "Active budget",
  get_budget_with_line_items: "Budget detail",
  list_categories: "List categories",
  list_merchants: "List merchants",
  list_recent_ai_actions: "Recent AI actions",
  reclassify_as_transfer: "Reclassify as transfer",
  set_transaction_category: "Set transaction category",
  apply_merchant_alias: "Apply merchant",
  merge_merchants: "Merge merchants",
  create_budget_from_draft: "Create budget",
  update_budget_line_item: "Update line item limit",
};

function toolNameFromPart(part: ToolPart): string {
  return part.type.replace(/^tool-/, "");
}

function humanizeTool(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name);
}

export interface BudgieToolPartProps {
  part: ToolPart;
  onApprove: (approvalId: string) => void | Promise<void>;
  onDeny: (args: {
    approvalId: string;
    toolName: string;
    argsJson: string;
    proposalSummary: string;
  }) => void | Promise<void>;
}

export function BudgieToolPart({ part, onApprove, onDeny }: BudgieToolPartProps) {
  const toolName = toolNameFromPart(part);
  const label = humanizeTool(toolName);
  const isWrite = isWriteTool(toolName);

  const state = (part as { state: string }).state;
  const input = (part as { input?: unknown }).input;
  const output = (part as { output?: unknown }).output;
  const errorText = (part as { errorText?: string }).errorText;
  const approval = (part as { approval?: { id: string } }).approval;

  if (state === "input-streaming") {
    return (
      <ToolShell label={label} isWrite={isWrite} accent="muted">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Preparing call…
        </div>
      </ToolShell>
    );
  }

  if (state === "input-available") {
    return (
      <ToolShell label={label} isWrite={isWrite} accent="muted">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Running…
        </div>
        <ToolJsonBlock title="Arguments" value={input} />
      </ToolShell>
    );
  }

  if (state === "approval-requested") {
    if (!approval) return null;
    const summary = describeProposal(toolName, input);
    return (
      <ApprovalCard
        toolName={toolName}
        label={label}
        input={input}
        proposalSummary={summary}
        onApprove={() => onApprove(approval.id)}
        onDeny={() =>
          onDeny({
            approvalId: approval.id,
            toolName,
            argsJson: JSON.stringify(input ?? {}),
            proposalSummary: summary,
          })
        }
      />
    );
  }

  if (state === "output-available") {
    return (
      <ToolShell label={label} isWrite={isWrite} accent={isWrite ? "success" : "muted"}>
        <ToolOutputSummary output={output} isWrite={isWrite} />
        <ToolJsonBlock title="Result detail" value={output} startCollapsed />
        <ToolJsonBlock title="Arguments" value={input} startCollapsed />
      </ToolShell>
    );
  }

  if (state === "output-error") {
    return (
      <ToolShell label={label} isWrite={isWrite} accent="error">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{errorText ?? "Tool call failed."}</span>
        </div>
        <ToolJsonBlock title="Arguments" value={input} startCollapsed />
      </ToolShell>
    );
  }

  if (state === "output-denied") {
    return (
      <ToolShell label={label} isWrite={isWrite} accent="error">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <X className="size-3.5" /> You denied this action.
        </div>
      </ToolShell>
    );
  }

  return null;
}

function ToolShell({
  label,
  isWrite,
  accent,
  children,
}: {
  label: string;
  isWrite: boolean;
  accent: "muted" | "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "border-l-4",
        accent === "muted" && "border-l-muted-foreground/40",
        accent === "success" && "border-l-emerald-500",
        accent === "error" && "border-l-destructive",
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            {isWrite ? "WRITE" : "READ"}
          </span>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function ApprovalCard({
  toolName,
  label,
  input,
  proposalSummary,
  onApprove,
  onDeny,
}: {
  toolName: string;
  label: string;
  input: unknown;
  proposalSummary: string;
  onApprove: () => void | Promise<void>;
  onDeny: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);

  const handle = async (kind: "approve" | "deny") => {
    if (pending) return;
    setPending(kind);
    try {
      if (kind === "approve") await onApprove();
      else await onDeny();
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="border-2 border-amber-500/60 bg-amber-50/40 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
          Approval needed
          <Badge variant="outline" className="ml-auto font-mono text-[10px]">
            {toolName}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="whitespace-pre-wrap text-sm text-foreground/90">
          {proposalSummary}
        </p>

        <Separator />

        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Exact arguments (verbatim)
          </p>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted/60 p-3 font-mono text-[11px] leading-relaxed">
            {JSON.stringify(input ?? {}, null, 2)}
          </pre>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => void handle("approve")}
            disabled={pending !== null}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {pending === "approve" ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Check className="mr-1 size-3.5" />
            )}
            Approve & run
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handle("deny")}
            disabled={pending !== null}
          >
            {pending === "deny" ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <X className="mr-1 size-3.5" />
            )}
            Deny
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolJsonBlock({
  title,
  value,
  startCollapsed = false,
}: {
  title: string;
  value: unknown;
  startCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!startCollapsed);
  if (value === undefined || value === null) return null;
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {title}
      </button>
      {open ? (
        <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[10.5px] leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function ToolOutputSummary({
  output,
  isWrite,
}: {
  output: unknown;
  isWrite: boolean;
}) {
  if (output === null || output === undefined) {
    return <div className="text-sm text-muted-foreground">No data.</div>;
  }
  if (typeof output !== "object") {
    return <div className="text-sm">{String(output)}</div>;
  }
  const o = output as Record<string, unknown>;

  if (Array.isArray(output)) {
    return (
      <div className="text-sm text-muted-foreground">
        Returned <span className="font-medium text-foreground">{output.length}</span>{" "}
        rows.
      </div>
    );
  }

  // Surface a few well-known summary fields without dumping the whole result.
  const summaryBits: string[] = [];
  if ("affected_count" in o) summaryBits.push(`affected: ${String(o["affected_count"])}`);
  if ("reclassified_count" in o)
    summaryBits.push(`reclassified: ${String(o["reclassified_count"])}`);
  if ("total" in o) summaryBits.push(`total: ${String(o["total"])}`);
  if ("budget_id" in o) summaryBits.push(`budget: ${String(o["budget_id"]).slice(0, 8)}…`);
  if ("rows" in o && Array.isArray(o["rows"])) {
    summaryBits.push(`${(o["rows"] as unknown[]).length} rows`);
  }
  if ("range" in o && o["range"] && typeof o["range"] === "object") {
    const r = o["range"] as { start_date?: string; end_date?: string };
    if (r.start_date && r.end_date) {
      summaryBits.push(`${r.start_date} → ${r.end_date}`);
    }
  }

  if (summaryBits.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {isWrite ? "Action applied." : "Result available below."}
      </div>
    );
  }
  return <div className="text-sm">{summaryBits.join(" · ")}</div>;
}

/**
 * Per-tool, human-readable proposal text shown at approval time. Built
 * from the args alone (the tool's `execute` has not run yet). The full
 * args are also displayed verbatim below this summary in the approval card.
 */
function describeProposal(toolName: string, input: unknown): string {
  const obj =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const countArray = (key: string): number => {
    const arr = obj[key];
    return Array.isArray(arr) ? arr.length : 0;
  };

  switch (toolName) {
    case "reclassify_as_transfer": {
      const n = countArray("transaction_ids");
      return `Reclassify ${n} transaction${n === 1 ? "" : "s"} as transfers between the two specified accounts. The transactions will no longer count as spending or income.`;
    }
    case "set_transaction_category": {
      const n = countArray("transaction_ids");
      const cat = obj["category_name"];
      return `Set the category to "${String(cat ?? "")}" on ${n} transaction${n === 1 ? "" : "s"}.`;
    }
    case "apply_merchant_alias": {
      const n = countArray("transaction_ids");
      const saveAlias = obj["save_alias_pattern"];
      const aliasText = saveAlias
        ? ` and save alias pattern "${String(saveAlias)}" for future imports`
        : "";
      return `Attribute ${n} transaction${n === 1 ? "" : "s"} to the specified merchant${aliasText}.`;
    }
    case "merge_merchants": {
      const n = countArray("merge_merchant_ids");
      return `Merge ${n} merchant record${n === 1 ? "" : "s"} into the keep merchant. All transactions and aliases on the merged merchants will be reassigned, then the merged records will be deleted.`;
    }
    case "create_budget_from_draft": {
      const n = countArray("line_items");
      const name = obj["name"];
      const active = obj["set_active"];
      return `Create a new budget named "${String(name ?? "")}" with ${n} line item${n === 1 ? "" : "s"}${active ? " and set it active" : ""}.`;
    }
    case "update_budget_line_item": {
      const newLimit = obj["new_limit_cents"];
      const newLimitDollars =
        typeof newLimit === "number"
          ? `$${(newLimit / 100).toFixed(2)}`
          : String(newLimit);
      return `Change the limit on this budget line item to ${newLimitDollars}.`;
    }
    default:
      return "Run this action?";
  }
}
