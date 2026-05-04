"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { addMonthsYYYYMM, monthBounds } from "@/lib/budget";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BudgetLineItemRow,
  type BudgetLineItemReportRow,
} from "@/components/budget/budget-line-item-row";
import { WaterfallSummaryBar } from "@/components/budget/waterfall-summary-bar";
import { useBudgets } from "@/hooks/use-budgets";

type WaterfallTier = {
  tier: "fixed" | "flexible" | "savings";
  budgetedCents: number;
  actualCents: number;
  remainingCents: number;
};

type Props = {
  month: string;
  onMonthChange: (m: string) => void;
  asOfDate: string;
  onAsOfChange: (iso: string) => void;
  monthly:
    | {
        month: string;
        monthlyIncomeCents: number;
        lineItems: BudgetLineItemReportRow[];
        projectedSavingsCents: number;
        unbudgetedSpendCents: number;
        unbudgetedCategories: {
          category: string;
          actualCents: number;
          transactionCount: number;
        }[];
        paceContext: {
          asOfDate: string;
          dayOfMonth: number;
          daysInMonth: number;
        };
      }
    | undefined;
  waterfall:
    | {
        tiers: WaterfallTier[];
        projectedSavingsCents: number;
        unbudgetedSpendCents: number;
      }
    | undefined;
};

const tierLabel: Record<WaterfallTier["tier"], string> = {
  fixed: "Fixed",
  flexible: "Flexible",
  savings: "Savings",
};

export function BudgetDashboard({
  month,
  onMonthChange,
  asOfDate,
  onAsOfChange,
  monthly,
  waterfall,
}: Props) {
  const bounds = monthBounds(month);
  const loading = monthly === undefined || waterfall === undefined;
  const { updateLineItem } = useBudgets();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="budget-month">Budget month</Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => onMonthChange(addMonthsYYYYMM(month, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              id="budget-month"
              className="w-[11rem]"
              type="month"
              value={month}
              onChange={(e) => onMonthChange(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next month"
              onClick={() => onMonthChange(addMonthsYYYYMM(month, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="budget-asof">Pace as of</Label>
          <Input
            id="budget-asof"
            type="date"
            className="w-[11rem]"
            min={bounds.startDate}
            max={bounds.endDate}
            value={asOfDate.slice(0, 10)}
            onChange={(e) => onAsOfChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Compares spending through this date vs expected linear pace.
          </p>
        </div>
      </div>

      {!loading && monthly && waterfall ? (
        <WaterfallSummaryBar
          incomeCents={monthly.monthlyIncomeCents}
          segments={waterfall.tiers}
          projectedSavingsCents={monthly.projectedSavingsCents}
        />
      ) : null}

      {!loading && monthly && monthly.unbudgetedSpendCents > 0 ? (
        <Alert>
          <AlertTitle>Unbudgeted spending detected</AlertTitle>
          <AlertDescription>
            {formatUsd(monthly.unbudgetedSpendCents)} of categorized spending is
            not covered by this budget. Add a category or group line to cover it.
          </AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {waterfall.tiers.map((t) => (
            <details key={t.tier} className="rounded-lg border bg-card" open>
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                {tierLabel[t.tier]}
              </summary>
              <div className="space-y-1 px-4 pb-4 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Budgeted</span>
                  <span>{formatUsd(t.budgetedCents)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Spent</span>
                  <span>{formatUsd(t.actualCents)}</span>
                </div>
                <div className="flex justify-between gap-2 font-medium">
                  <span>Remaining</span>
                  <span>{formatUsd(t.remainingCents)}</span>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      {!loading && monthly ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Income & savings target</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Monthly income</span>
                <span>{formatUsd(monthly.monthlyIncomeCents)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  Implied savings (after budget)
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {formatUsd(monthly.projectedSavingsCents)}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Unbudgeted spend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Total</span>
                <span>
                  {formatUsd(monthly.unbudgetedSpendCents)}
                </span>
              </div>
              {monthly.unbudgetedCategories.length > 0 ? (
                <ul className="mt-2 max-h-24 list-inside list-disc overflow-y-auto text-xs text-muted-foreground">
                  {monthly.unbudgetedCategories.slice(0, 6).map((u) => (
                    <li key={u.category}>
                      {u.category}: {formatUsd(u.actualCents)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  All categorized spending is covered by a budget line.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-2">
          {loading ? (
            <Skeleton className="mx-4 h-40 rounded-lg" />
          ) : monthly ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>Pace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthly.lineItems.map((row) => (
                  <BudgetLineItemRow
                    key={row.lineItemId}
                    row={row}
                    onLimitSave={async (lineItemId, cents) => {
                      await updateLineItem({ lineItemId, limitCents: cents });
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
