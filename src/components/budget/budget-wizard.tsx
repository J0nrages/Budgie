"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useBudgets } from "@/hooks/use-budgets";
import { useCategories } from "@/hooks/use-categories";
import {
  useDetectMonthlyIncome,
  useDetectRecurringBills,
} from "@/hooks/use-budget-reports";
import { formatUsd, parseUsdToCents } from "@/lib/money";
import { currentMonthYYYYMM, waterfallBreakdown } from "@/lib/budget";
import type { Id } from "convex/_generated/dataModel";

type Props = {
  onComplete?: () => void;
};

const STEPS = [
  "Income",
  "Fixed costs",
  "Flexible budgets",
  "Savings goals",
  "Review",
] as const;

export function BudgetWizard({ onComplete }: Props) {
  const incomeSuggestion = useDetectMonthlyIncome(6);
  const recurringBills = useDetectRecurringBills(6);
  const { historicalAverages, create, setActive } = useBudgets();
  const { allGroups, categories, suggestions, createGroup, seedFromTransactions } =
    useCategories();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Main budget");
  const [effectiveFrom, setEffectiveFrom] = useState(() => currentMonthYYYYMM());
  const [income, setIncome] = useState("");
  const [fixedKeys, setFixedKeys] = useState<Set<string>>(new Set());
  const [flexibleCategoryIds, setFlexibleCategoryIds] = useState<
    Set<Id<"categories">>
  >(new Set());
  const [savingsName, setSavingsName] = useState("Savings goals");
  const [savingsAmount, setSavingsAmount] = useState("0");
  const [busy, setBusy] = useState(false);

  const incomeCents =
    parseUsdToCents(income) ??
    incomeSuggestion?.suggestedMonthlyIncomeCents ??
    0;

  const fixedTotal = useMemo(() => {
    return (recurringBills ?? [])
      .filter((bill) => fixedKeys.has(bill.key))
      .reduce((total, bill) => total + bill.averageAmountCents, 0);
  }, [fixedKeys, recurringBills]);

  const flexibleRows = useMemo(() => {
    const rows = categories ?? [];
    return rows
      .map((category) => {
        const avg = historicalAverages?.find(
          (row) => row.categoryId === category._id,
        )?.averageCents;
        return {
          category,
          suggestedCents:
            avg ??
            suggestions?.find((s) => s.normalizedKey === category.normalizedKey)
              ?.totalCents ??
            0,
        };
      })
      .filter((row) => row.suggestedCents > 0)
      .slice(0, 12);
  }, [categories, historicalAverages, suggestions]);

  const flexibleTotal = flexibleRows
    .filter((row) => flexibleCategoryIds.has(row.category._id))
    .reduce((total, row) => total + row.suggestedCents, 0);
  const savingsCents = parseUsdToCents(savingsAmount) ?? 0;
  const preview = waterfallBreakdown({
    incomeCents,
    fixedItems: [{ amountCents: fixedTotal }],
    flexibleItems: [{ amountCents: flexibleTotal }],
    savingsItems: [{ amountCents: savingsCents }],
  });

  const ensureGroup = async (
    groupName: string,
    waterfallTier: "fixed" | "flexible" | "savings",
  ) => {
    const existing = allGroups?.find((group) => group.name === groupName);
    if (existing) return existing._id;
    return await createGroup({ name: groupName, waterfallTier });
  };

  const confirm = async () => {
    const parsedIncome = parseUsdToCents(income);
    if (parsedIncome === null || parsedIncome < 0) return;
    setBusy(true);
    try {
      if (!categories || categories.length === 0) {
        await seedFromTransactions({});
      }
      const fixedGroupId = await ensureGroup("Fixed Costs", "fixed");
      const savingsGroupId = await ensureGroup(
        savingsName.trim() || "Savings Goals",
        "savings",
      );
      const lineItems = [
        ...(fixedTotal > 0
          ? [
              {
                categoryGroupId: fixedGroupId,
                targetType: "spending" as const,
                limitCents: fixedTotal,
                cadence: "monthly" as const,
                refillBehavior: "refillUpTo" as const,
                rolloverUnused: false,
                sortOrder: 0,
              },
            ]
          : []),
        ...flexibleRows
          .filter((row) => flexibleCategoryIds.has(row.category._id))
          .map((row, index) => ({
            categoryId: row.category._id,
            targetType: "spending" as const,
            limitCents: row.suggestedCents,
            cadence: "monthly" as const,
            refillBehavior: "refillUpTo" as const,
            rolloverUnused: false,
            sortOrder: index + 1,
          })),
        ...(savingsCents > 0
          ? [
              {
                categoryGroupId: savingsGroupId,
                targetType: "monthlyBuilder" as const,
                limitCents: savingsCents,
                cadence: "monthly" as const,
                refillBehavior: "setAside" as const,
                rolloverUnused: true,
                sortOrder: 500,
              },
            ]
          : []),
      ];
      const id = await create({
        name: name.trim() || "Main budget",
        monthlyIncomeCents: parsedIncome,
        effectiveFrom,
        lineItems,
      });
      await setActive({ budgetId: id });
      onComplete?.();
    } finally {
      setBusy(false);
    }
  };

  const canGoNext = step < STEPS.length - 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          Guided budget setup
        </CardTitle>
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={
                index === step
                  ? "rounded-full bg-primary px-2 py-1 text-primary-foreground"
                  : "rounded-full bg-muted px-2 py-1"
              }
            >
              {index + 1}. {label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {step === 0 ? (
          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We detected recent income from transaction history. Adjust it
              before creating the budget.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Budget name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Effective from</Label>
                <Input
                  type="month"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Monthly income (USD)</Label>
              <Input
                value={income}
                placeholder={
                  incomeSuggestion
                    ? (incomeSuggestion.suggestedMonthlyIncomeCents / 100).toFixed(
                        2,
                      )
                    : "4000.00"
                }
                onChange={(e) => setIncome(e.target.value)}
              />
              {incomeSuggestion === undefined ? (
                <Skeleton className="h-5 w-44" />
              ) : incomeSuggestion.suggestedMonthlyIncomeCents > 0 ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() =>
                    setIncome(
                      (incomeSuggestion.suggestedMonthlyIncomeCents / 100).toFixed(
                        2,
                      ),
                    )
                  }
                >
                  Use detected {formatUsd(incomeSuggestion.suggestedMonthlyIncomeCents)}
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select detected recurring bills to group under Fixed Costs.
            </p>
            {recurringBills === undefined ? (
              <Skeleton className="h-32 rounded-lg" />
            ) : recurringBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recurring monthly bills detected yet.
              </p>
            ) : (
              recurringBills.slice(0, 12).map((bill) => (
                <label
                  key={bill.key}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <span className="flex items-center gap-3">
                    <Checkbox
                      checked={fixedKeys.has(bill.key)}
                      onCheckedChange={(checked) => {
                        setFixedKeys((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(bill.key);
                          else next.delete(bill.key);
                          return next;
                        });
                      }}
                    />
                    <span>
                      <span className="block font-medium">
                        {bill.merchantName ?? bill.category ?? bill.key}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {bill.occurrenceCount} matches · confidence{" "}
                        {Math.round(bill.confidence * 100)}%
                      </span>
                    </span>
                  </span>
                  <span>{formatUsd(bill.averageAmountCents)}</span>
                </label>
              ))
            )}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose flexible categories using historical averages as editable
              starting points after setup.
            </p>
            {flexibleRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No structured categories with history yet. Use the category
                manager to seed categories from transactions.
              </p>
            ) : (
              flexibleRows.map((row) => (
                <label
                  key={row.category._id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <span className="flex items-center gap-3">
                    <Checkbox
                      checked={flexibleCategoryIds.has(row.category._id)}
                      onCheckedChange={(checked) => {
                        setFlexibleCategoryIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(row.category._id);
                          else next.delete(row.category._id);
                          return next;
                        });
                      }}
                    />
                    <span className="font-medium">{row.category.name}</span>
                  </span>
                  <span>{formatUsd(row.suggestedCents)}</span>
                </label>
              ))
            )}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Optional: set a monthly savings builder target. Leave it at zero
              to skip.
            </p>
            <div className="space-y-1">
              <Label>Savings group name</Label>
              <Input
                value={savingsName}
                onChange={(e) => setSavingsName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Monthly savings target (USD)</Label>
              <Input
                value={savingsAmount}
                onChange={(e) => setSavingsAmount(e.target.value)}
              />
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Review the waterfall before creating your active budget.
            </p>
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <Row label="Income" value={preview.incomeCents} />
              <Row label="Fixed costs" value={-preview.fixedCents} />
              <Row label="After fixed" value={preview.afterFixedCents} />
              <Separator />
              <Row label="Flexible budgets" value={-preview.flexibleCents} />
              <Row label="After flexible" value={preview.afterFlexibleCents} />
              <Separator />
              <Row label={savingsName || "Savings goals"} value={-preview.savingsCents} />
              <Row
                label="Projected savings"
                value={preview.projectedSavingsCents}
                strong
              />
            </div>
          </section>
        ) : null}

        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          {canGoNext ? (
            <Button
              type="button"
              disabled={step === 0 && incomeCents <= 0}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            >
              Next
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" disabled={busy} onClick={() => void confirm()}>
              <Check className="mr-1 h-4 w-4" />
              Create active budget
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "flex justify-between font-medium" : "flex justify-between"}>
      <span>{label}</span>
      <span>{formatUsd(value)}</span>
    </div>
  );
}
