"use client";

import { useState } from "react";
import { Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PaceBadge } from "@/components/budget/pace-indicator";
import { formatUsd, parseUsdToCents } from "@/lib/money";
import type { Id } from "convex/_generated/dataModel";

export type BudgetLineItemReportRow = {
  lineItemId: Id<"budgetLineItems">;
  targetName: string;
  targetScope: "category" | "group";
  targetType: "spending" | "savingsBalance" | "monthlyBuilder";
  limitCents: number;
  actualCents: number;
  remainingCents: number;
  percentUsed: number;
  expectedPercentByPace: number;
  paceStatus:
    | "underPace"
    | "nearPace"
    | "overPace"
    | "overBudget";
  tier: "fixed" | "flexible" | "savings";
};

export function BudgetLineItemRow({
  row,
  onLimitSave,
}: {
  row: BudgetLineItemReportRow;
  onLimitSave: (lineItemId: Id<"budgetLineItems">, cents: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState((row.limitCents / 100).toFixed(2));
  const actualWidth = Math.min(Math.max(row.percentUsed, 0), 100);
  const paceWidth = Math.min(Math.max(row.expectedPercentByPace, 0), 100);

  const save = async () => {
    const cents = parseUsdToCents(draft);
    if (cents === null || cents < 0) return;
    await onLimitSave(row.lineItemId, cents);
    setEditing(false);
  };

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.targetName}</div>
        <div className="text-xs capitalize text-muted-foreground">
          {row.targetScope} · {row.targetType}
        </div>
      </TableCell>
      <TableCell className="capitalize">{row.tier}</TableCell>
      <TableCell className="text-right tabular-nums">
        {editing ? (
          <div className="ml-auto flex max-w-36 gap-1">
            <Input
              className="h-8"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="button" size="sm" onClick={() => void save()}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft((row.limitCents / 100).toFixed(2));
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            onClick={() => setEditing(true)}
          >
            {formatUsd(row.limitCents)}
            <Edit3 className="h-3 w-3" />
          </button>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatUsd(row.actualCents)}
      </TableCell>
      <TableCell className="min-w-40">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="space-y-1"
                aria-label={`${row.targetName}: ${row.percentUsed}% used, expected ${row.expectedPercentByPace}% by pace`}
              >
                <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary/30"
                    style={{ width: `${paceWidth}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-primary"
                    style={{ width: `${actualWidth}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{row.percentUsed}% used</span>
                  <span>{row.expectedPercentByPace}% pace</span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Actual spend is {formatUsd(row.actualCents)}. Linear pace expects{" "}
              {row.expectedPercentByPace}% by the selected date.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell>
        <PaceBadge status={row.paceStatus} />
      </TableCell>
    </TableRow>
  );
}
