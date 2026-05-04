"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useBudgets } from "@/hooks/use-budgets";
import { useCategories } from "@/hooks/use-categories";
import {
  useDetectMonthlyIncome,
  useDetectRecurringBills,
} from "@/hooks/use-budget-reports";
import { formatUsd, parseUsdToCents } from "@/lib/money";
import { currentMonthYYYYMM, waterfallBreakdown } from "@/lib/budget";
import { cn } from "@/lib/utils";
import type { Id } from "convex/_generated/dataModel";
import { AmountStepper } from "@/components/budget/amount-stepper";

type Props = {
  onComplete?: () => void;
};

type IncomeSource = {
  id: string;
  label: string;
  cents: number;
};

type Bill = {
  id: string;
  name: string;
  cents: number;
  detectedKey?: string;
};

type CategoryBudget = {
  id: string;
  categoryId?: Id<"categories">;
  name: string;
  cents: number;
};

const STEPS = [
  { id: "income", label: "Income" },
  { id: "bills", label: "Bills" },
  { id: "categories", label: "Categories" },
  { id: "review", label: "Review" },
] as const;

const INCOME_MAX = 5_000_000; // $50k/mo cap on slider
const BILL_MAX = 2_000_000; // $20k/mo cap
const CATEGORY_MAX = 1_000_000; // $10k/mo cap

export function BudgetWizard({ onComplete }: Props) {
  const incomeSuggestion = useDetectMonthlyIncome(6);
  const recurringBills = useDetectRecurringBills(6);
  const { historicalAverages, create, setActive } = useBudgets();
  const {
    allGroups,
    categories,
    suggestions,
    createGroup,
    seedFromTransactions,
  } = useCategories();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Main budget");
  const [effectiveFrom, setEffectiveFrom] = useState(() => currentMonthYYYYMM());

  // Step 1 — income
  const [incomes, setIncomes] = useState<IncomeSource[]>([
    { id: "primary", label: "Your paycheck", cents: 0 },
  ]);
  const [syncedIncomeKey, setSyncedIncomeKey] = useState<string | null>(null);
  const [incomeTouched, setIncomeTouched] = useState(false);
  const [showPaychecks, setShowPaychecks] = useState(false);

  // Step 2 — bills
  const [bills, setBills] = useState<Bill[]>([]);
  const [syncedBillsKey, setSyncedBillsKey] = useState<string | null>(null);
  const [billsTouched, setBillsTouched] = useState(false);
  const [billPickerOpen, setBillPickerOpen] = useState(false);

  // Step 3 — flexible budget categories
  const [budgetCats, setBudgetCats] = useState<CategoryBudget[]>([]);
  const [syncedCatsKey, setSyncedCatsKey] = useState<string | null>(null);
  const [catsTouched, setCatsTouched] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Step 4 — savings target (optional, like Rocket Money's "Projected Savings")
  const [savingsEnabled, setSavingsEnabled] = useState(false);
  const [savingsName, setSavingsName] = useState("Savings goals");
  const [savingsAmount, setSavingsAmount] = useState("0");

  // React 19 pattern: sync untouched drafts during render when live Convex
  // results change, instead of useEffect. Once the user edits a section, its
  // touched flag prevents auto-detection from clobbering their draft.
  const incomeSyncKey =
    incomeSuggestion === undefined
      ? null
      : [
          incomeSuggestion.suggestedMonthlyIncomeCents,
          incomeSuggestion.samples,
          incomeSuggestion.windowEndMonth ?? "",
        ].join(":");
  const detectedIncomeCents =
    incomeSuggestion?.suggestedMonthlyIncomeCents ?? 0;
  if (
    !incomeTouched &&
    incomeSyncKey !== null &&
    incomeSyncKey !== syncedIncomeKey
  ) {
    setSyncedIncomeKey(incomeSyncKey);
    setIncomes([
      {
        id: "primary",
        label: "Your paycheck",
        cents: detectedIncomeCents,
      },
    ]);
  }

  const detectedBillRows = recurringBills ?? [];
  const billsSyncKey =
    recurringBills === undefined
      ? null
      : detectedBillRows
          .map(
            (bill) =>
              `${bill.key}:${bill.averageAmountCents}:${bill.occurrenceCount}:${bill.lastDate}`,
          )
          .join("|");
  if (
    !billsTouched &&
    billsSyncKey !== null &&
    billsSyncKey !== syncedBillsKey
  ) {
    setSyncedBillsKey(billsSyncKey);
    const detected = detectedBillRows.slice(0, 8);
    setBills(
      detected.map((bill) => ({
        id: bill.key,
        detectedKey: bill.key,
        name: bill.merchantName ?? bill.category ?? bill.key,
        cents: bill.averageAmountCents,
      })),
    );
  }

  const flexibleSuggestions = useMemo(() => {
    const rows = (categories ?? [])
      .map((category) => {
        const avg = historicalAverages?.find(
          (row) => row.categoryId === category._id,
        )?.averageCents;
        const fallback = suggestions?.find(
          (s) => s.normalizedKey === category.normalizedKey,
        )?.totalCents;
        return {
          categoryId: category._id,
          name: category.name,
          suggestedCents: avg ?? fallback ?? 0,
        };
      })
      .filter((row) => row.suggestedCents > 0);
    rows.sort((a, b) => b.suggestedCents - a.suggestedCents);
    return rows;
  }, [categories, historicalAverages, suggestions]);

  const catsSyncKey =
    categories === undefined || historicalAverages === undefined
      ? null
      : flexibleSuggestions
          .map((row) => `${row.categoryId}:${row.suggestedCents}`)
          .join("|");
  if (!catsTouched && catsSyncKey !== null && catsSyncKey !== syncedCatsKey) {
    setSyncedCatsKey(catsSyncKey);
    const top = flexibleSuggestions.slice(0, 5);
    setBudgetCats(
      top.map((row) => ({
        id: row.categoryId,
        categoryId: row.categoryId,
        name: row.name,
        cents: row.suggestedCents,
      })),
    );
  }

  const totalIncomeCents = incomes.reduce(
    (total, source) => total + Math.max(0, source.cents),
    0,
  );
  const totalBillsCents = bills.reduce(
    (total, bill) => total + Math.max(0, bill.cents),
    0,
  );
  const totalCategoryCents = budgetCats.reduce(
    (total, cat) => total + Math.max(0, cat.cents),
    0,
  );
  const savingsCents = savingsEnabled
    ? Math.max(0, parseUsdToCents(savingsAmount) ?? 0)
    : 0;

  const preview = waterfallBreakdown({
    incomeCents: totalIncomeCents,
    fixedItems: [{ amountCents: totalBillsCents }],
    flexibleItems: [{ amountCents: totalCategoryCents }],
    savingsItems: [{ amountCents: savingsCents }],
  });

  const usedCategoryIds = new Set(
    budgetCats.map((c) => c.categoryId).filter(Boolean) as Id<"categories">[],
  );
  const availableCategoryRows = flexibleSuggestions.filter(
    (row) => !usedCategoryIds.has(row.categoryId),
  );

  const detectedKeyTaken = new Set(
    bills.map((b) => b.detectedKey).filter(Boolean) as string[],
  );
  const availableDetectedBills = (recurringBills ?? []).filter(
    (b) => !detectedKeyTaken.has(b.key),
  );

  const onAddIncomeSource = () => {
    setIncomeTouched(true);
    setIncomes((prev) => [
      ...prev,
      {
        id: `extra-${prev.length}-${Date.now()}`,
        label: prev.length === 1 ? "Spouse paycheck" : `Income source ${prev.length + 1}`,
        cents: 0,
      },
    ]);
  };

  const updateIncome = (id: string, patch: Partial<IncomeSource>) => {
    setIncomeTouched(true);
    setIncomes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const removeIncome = (id: string) => {
    setIncomeTouched(true);
    setIncomes((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  };

  const addBill = (bill: Bill) => {
    setBillsTouched(true);
    setBills((prev) => [...prev, bill]);
  };
  const updateBill = (id: string, patch: Partial<Bill>) => {
    setBillsTouched(true);
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const removeBill = (id: string) => {
    setBillsTouched(true);
    setBills((prev) => prev.filter((b) => b.id !== id));
  };

  const addCategoryBudget = (cat: CategoryBudget) => {
    setCatsTouched(true);
    setBudgetCats((prev) => [...prev, cat]);
  };
  const updateCategoryBudget = (id: string, patch: Partial<CategoryBudget>) => {
    setCatsTouched(true);
    setBudgetCats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  };
  const removeCategoryBudget = (id: string) => {
    setCatsTouched(true);
    setBudgetCats((prev) => prev.filter((c) => c.id !== id));
  };

  const ensureGroup = async (
    groupName: string,
    waterfallTier: "fixed" | "flexible" | "savings",
  ) => {
    const existing = allGroups?.find((group) => group.name === groupName);
    if (existing) return existing._id;
    return await createGroup({ name: groupName, waterfallTier });
  };

  const canContinueIncome = totalIncomeCents > 0;
  const canContinueBills = true;
  const canContinueCategories = true;

  const goNext = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const confirm = async () => {
    if (totalIncomeCents <= 0) return;
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
        ...(totalBillsCents > 0
          ? [
              {
                categoryGroupId: fixedGroupId,
                targetType: "spending" as const,
                limitCents: totalBillsCents,
                cadence: "monthly" as const,
                refillBehavior: "refillUpTo" as const,
                rolloverUnused: false,
                sortOrder: 0,
              },
            ]
          : []),
        ...budgetCats
          .filter((c) => c.categoryId && c.cents > 0)
          .map((c, index) => ({
            categoryId: c.categoryId,
            targetType: "spending" as const,
            limitCents: c.cents,
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
        monthlyIncomeCents: totalIncomeCents,
        effectiveFrom,
        lineItems,
      });
      await setActive({ budgetId: id });
      onComplete?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-visible">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Set up your budget
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <CardDescription>
            We&rsquo;ll use your income, bills, and spending history to draft a
            monthly plan you can fine-tune anytime.
          </CardDescription>
          <StepperRail currentStep={step} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="bw-name" className="text-xs">
                Budget name
              </Label>
              <Input
                id="bw-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bw-effective" className="text-xs">
                Effective from
              </Label>
              <Input
                id="bw-effective"
                type="month"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-4">
        {step === 0 ? (
          <IncomeStep
            incomes={incomes}
            totalIncomeCents={totalIncomeCents}
            incomeSuggestion={incomeSuggestion}
            showPaychecks={showPaychecks}
            onTogglePaychecks={() => setShowPaychecks((v) => !v)}
            onChangeIncome={updateIncome}
            onAddIncome={onAddIncomeSource}
            onRemoveIncome={removeIncome}
          />
        ) : null}

        {step === 1 ? (
          <BillsStep
            bills={bills}
            totalBillsCents={totalBillsCents}
            recurringBillsLoading={recurringBills === undefined}
            availableDetectedBills={availableDetectedBills}
            billPickerOpen={billPickerOpen}
            onToggleBillPicker={() => setBillPickerOpen((v) => !v)}
            onAddBill={addBill}
            onUpdateBill={updateBill}
            onRemoveBill={removeBill}
          />
        ) : null}

        {step === 2 ? (
          <CategoriesStep
            budgetCats={budgetCats}
            totalCategoryCents={totalCategoryCents}
            totalIncomeCents={totalIncomeCents}
            totalBillsCents={totalBillsCents}
            historicalLoading={
              categories === undefined || historicalAverages === undefined
            }
            availableCategoryRows={availableCategoryRows}
            showCategoryPicker={showCategoryPicker}
            onToggleCategoryPicker={() =>
              setShowCategoryPicker((v) => !v)
            }
            onAddCategoryBudget={addCategoryBudget}
            onUpdateCategoryBudget={updateCategoryBudget}
            onRemoveCategoryBudget={removeCategoryBudget}
          />
        ) : null}

        {step === 3 ? (
          <ReviewStep
            preview={preview}
            incomes={incomes}
            bills={bills}
            budgetCats={budgetCats}
            savingsEnabled={savingsEnabled}
            onToggleSavings={() => setSavingsEnabled((v) => !v)}
            savingsName={savingsName}
            onChangeSavingsName={setSavingsName}
            savingsAmount={savingsAmount}
            onChangeSavingsAmount={setSavingsAmount}
          />
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || busy}
            onClick={goBack}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={
                (step === 0 && !canContinueIncome) ||
                (step === 1 && !canContinueBills) ||
                (step === 2 && !canContinueCategories)
              }
              onClick={goNext}
            >
              {step === 1
                ? `Continue with ${bills.length} bill${bills.length === 1 ? "" : "s"}`
                : "Continue"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || totalIncomeCents <= 0}
              onClick={() => void confirm()}
            >
              <Check className="mr-1 h-4 w-4" />
              Create my budget
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* Stepper rail                                                           */
/* ---------------------------------------------------------------------- */

function StepperRail({ currentStep }: { currentStep: number }) {
  return (
    <ol className="flex w-full items-center gap-2" aria-label="Setup progress">
      {STEPS.map((s, idx) => {
        const isComplete = idx < currentStep;
        const isCurrent = idx === currentStep;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : isComplete
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isComplete ? <Check className="h-3.5 w-3.5" /> : idx + 1}
            </div>
            <span
              className={cn(
                "hidden text-xs sm:inline",
                isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {idx < STEPS.length - 1 ? (
              <div
                className={cn(
                  "h-px flex-1 transition-colors",
                  isComplete ? "bg-primary/30" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 1 — Income                                                        */
/* ---------------------------------------------------------------------- */

function IncomeStep({
  incomes,
  totalIncomeCents,
  incomeSuggestion,
  showPaychecks,
  onTogglePaychecks,
  onChangeIncome,
  onAddIncome,
  onRemoveIncome,
}: {
  incomes: IncomeSource[];
  totalIncomeCents: number;
  incomeSuggestion: ReturnType<typeof useDetectMonthlyIncome>;
  showPaychecks: boolean;
  onTogglePaychecks: () => void;
  onChangeIncome: (id: string, patch: Partial<IncomeSource>) => void;
  onAddIncome: () => void;
  onRemoveIncome: (id: string) => void;
}) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight">
          What&rsquo;s your monthly income?
        </h3>
        <p className="text-sm text-muted-foreground">
          We&rsquo;ll use this to calculate how much you&rsquo;re saving each
          month. Add a second source for a spouse, partner, or side hustle.
        </p>
      </header>

      <div className="rounded-2xl border bg-muted/30 p-6">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total household income
          </p>
        </div>
        <div className="mt-2">
          <AmountStepper
            valueCents={totalIncomeCents}
            min={0}
            max={INCOME_MAX}
            step={5_000}
            ariaLabel="Total household income"
            showSlider={false}
            onChangeCents={(next) => {
              if (incomes.length === 0) return;
              const primary = incomes[0];
              const others = incomes.slice(1);
              const otherSum = others.reduce((s, x) => s + x.cents, 0);
              onChangeIncome(primary.id, {
                cents: Math.max(0, next - otherSum),
              });
            }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Wallet className="h-4 w-4" />
            Income sources
          </h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddIncome}
          >
            <Plus className="h-3.5 w-3.5" />
            Add source
          </Button>
        </div>

        <ul className="space-y-2">
          {incomes.map((source, idx) => (
            <li
              key={source.id}
              className="rounded-lg border bg-background p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <Input
                  className="h-8 max-w-56 border-transparent bg-transparent px-1 text-sm font-medium shadow-none focus-visible:border-ring focus-visible:bg-background"
                  value={source.label}
                  placeholder={
                    idx === 0 ? "Your paycheck" : "Spouse paycheck"
                  }
                  onChange={(e) =>
                    onChangeIncome(source.id, { label: e.target.value })
                  }
                />
                <div className="flex items-center gap-2">
                  <AmountStepper
                    variant="row"
                    valueCents={source.cents}
                    onChangeCents={(cents) =>
                      onChangeIncome(source.id, { cents })
                    }
                    min={0}
                    max={INCOME_MAX}
                    step={5_000}
                    ariaLabel={`${source.label} amount`}
                  />
                  {incomes.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove source"
                      onClick={() => onRemoveIncome(source.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {incomeSuggestion === undefined ? (
          <Skeleton className="h-5 w-44" />
        ) : incomeSuggestion.samples > 0 ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={onTogglePaychecks}
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                showPaychecks ? "rotate-180" : "",
              )}
            />
            View {incomeSuggestion.samples} detected paycheck
            {incomeSuggestion.samples === 1 ? "" : "s"} from the last 6 months
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">
            We didn&rsquo;t detect any income transactions yet. Enter your
            monthly take-home pay above.
          </p>
        )}
        {showPaychecks && incomeSuggestion ? (
          <div className="mt-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            We averaged {incomeSuggestion.samples} income transaction
            {incomeSuggestion.samples === 1 ? "" : "s"} across the last 6
            months ending {incomeSuggestion.windowEndMonth ?? "—"}, suggesting{" "}
            <span className="font-medium text-foreground">
              {formatUsd(incomeSuggestion.suggestedMonthlyIncomeCents)}
            </span>{" "}
            per month.
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 2 — Bills                                                         */
/* ---------------------------------------------------------------------- */

function BillsStep({
  bills,
  totalBillsCents,
  recurringBillsLoading,
  availableDetectedBills,
  billPickerOpen,
  onToggleBillPicker,
  onAddBill,
  onUpdateBill,
  onRemoveBill,
}: {
  bills: Bill[];
  totalBillsCents: number;
  recurringBillsLoading: boolean;
  availableDetectedBills: NonNullable<
    ReturnType<typeof useDetectRecurringBills>
  >;
  billPickerOpen: boolean;
  onToggleBillPicker: () => void;
  onAddBill: (bill: Bill) => void;
  onUpdateBill: (id: string, patch: Partial<Bill>) => void;
  onRemoveBill: (id: string) => void;
}) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight">
          Set up your bills
        </h3>
        <p className="text-sm text-muted-foreground">
          Add rent, utilities, insurance, subscriptions — anything you&rsquo;d
          consider a fixed monthly bill. We&rsquo;ve pulled candidates from your
          transactions.
        </p>
      </header>

      <div className="rounded-2xl border bg-muted/30 p-6">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total monthly bills
          </p>
        </div>
        <div className="mt-2">
          <AmountStepper
            valueCents={totalBillsCents}
            min={0}
            max={BILL_MAX}
            step={2_500}
            ariaLabel="Total monthly bills"
            showSlider={false}
            onChangeCents={() => {
              /* read-only summary; users edit per-bill */
            }}
          />
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Edit individual bills below.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Receipt className="h-4 w-4" />
            Bills{" "}
            <Badge variant="secondary" className="ml-1">
              {bills.length}
            </Badge>
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleBillPicker}
              disabled={recurringBillsLoading}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  billPickerOpen ? "rotate-180" : "",
                )}
              />
              Select detected bills
              <Badge variant="ghost" className="ml-1 px-1">
                {availableDetectedBills.length}
              </Badge>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onAddBill({
                  id: `manual-${Date.now()}`,
                  name: "New bill",
                  cents: 0,
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add a bill
            </Button>
          </div>
        </div>

        {billPickerOpen ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            {recurringBillsLoading ? (
              <Skeleton className="h-20" />
            ) : availableDetectedBills.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Every detected recurring bill is already in your list. Use{" "}
                <span className="font-medium">Add a bill</span> to create
                custom ones.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {availableDetectedBills.map((bill) => (
                  <li key={bill.key}>
                    <button
                      type="button"
                      onClick={() => {
                        onAddBill({
                          id: bill.key,
                          detectedKey: bill.key,
                          name:
                            bill.merchantName ?? bill.category ?? bill.key,
                          cents: bill.averageAmountCents,
                        });
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-md border bg-background p-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">
                          {bill.merchantName ?? bill.category ?? bill.key}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {bill.occurrenceCount} matches ·{" "}
                          {Math.round(bill.confidence * 100)}% confidence
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-sm tabular-nums">
                        {formatUsd(bill.averageAmountCents)}
                        <Plus className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {bills.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            No bills yet. Add detected ones above or create a new bill.
          </p>
        ) : (
          <ul className="space-y-2">
            {bills.map((bill) => (
              <li
                key={bill.id}
                className="rounded-lg border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <Input
                    className="h-8 max-w-64 border-transparent bg-transparent px-1 text-sm font-medium shadow-none focus-visible:border-ring focus-visible:bg-background"
                    value={bill.name}
                    onChange={(e) =>
                      onUpdateBill(bill.id, { name: e.target.value })
                    }
                  />
                  <div className="flex items-center gap-2">
                    <AmountStepper
                      variant="row"
                      valueCents={bill.cents}
                      onChangeCents={(cents) => onUpdateBill(bill.id, { cents })}
                      min={0}
                      max={BILL_MAX}
                      step={500}
                      ariaLabel={`${bill.name} amount`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove bill"
                      onClick={() => onRemoveBill(bill.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 3 — Categories                                                    */
/* ---------------------------------------------------------------------- */

function CategoriesStep({
  budgetCats,
  totalCategoryCents,
  totalIncomeCents,
  totalBillsCents,
  historicalLoading,
  availableCategoryRows,
  showCategoryPicker,
  onToggleCategoryPicker,
  onAddCategoryBudget,
  onUpdateCategoryBudget,
  onRemoveCategoryBudget,
}: {
  budgetCats: CategoryBudget[];
  totalCategoryCents: number;
  totalIncomeCents: number;
  totalBillsCents: number;
  historicalLoading: boolean;
  availableCategoryRows: {
    categoryId: Id<"categories">;
    name: string;
    suggestedCents: number;
  }[];
  showCategoryPicker: boolean;
  onToggleCategoryPicker: () => void;
  onAddCategoryBudget: (cat: CategoryBudget) => void;
  onUpdateCategoryBudget: (id: string, patch: Partial<CategoryBudget>) => void;
  onRemoveCategoryBudget: (id: string) => void;
}) {
  const projectedSavings = Math.max(
    0,
    totalIncomeCents - totalBillsCents - totalCategoryCents,
  );
  const totalBudget = totalBillsCents + totalCategoryCents;
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight">
          Create your budget categories
        </h3>
        <p className="text-sm text-muted-foreground">
          Set a monthly limit for each spending category. Your projected
          savings updates as you go.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-muted/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total budget
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatUsd(totalBudget)}
          </p>
          <p className="text-xs text-muted-foreground">
            Bills + categories you&rsquo;ve set
          </p>
        </div>
        <div className="rounded-2xl border bg-emerald-500/10 p-4 ring-1 ring-emerald-500/20 dark:bg-emerald-500/5">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Projected savings
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatUsd(projectedSavings)}
          </p>
          <p className="text-xs text-muted-foreground">
            Income − bills − categories
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">
            Categories{" "}
            <Badge variant="secondary" className="ml-1">
              {budgetCats.length}
            </Badge>
          </h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={historicalLoading}
            onClick={onToggleCategoryPicker}
          >
            <Plus className="h-3.5 w-3.5" />
            Add a budget
          </Button>
        </div>

        {showCategoryPicker ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            {historicalLoading ? (
              <Skeleton className="h-20" />
            ) : availableCategoryRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing left to recommend. Use the budget settings later to
                add custom categories.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {availableCategoryRows.slice(0, 12).map((row) => (
                  <li key={row.categoryId}>
                    <button
                      type="button"
                      onClick={() => {
                        onAddCategoryBudget({
                          id: row.categoryId,
                          categoryId: row.categoryId,
                          name: row.name,
                          cents: row.suggestedCents,
                        });
                        onToggleCategoryPicker();
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-md border bg-background p-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{row.name}</span>
                        <span className="text-xs text-muted-foreground">
                          Avg historical
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-sm tabular-nums">
                        {formatUsd(row.suggestedCents)}
                        <Plus className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {budgetCats.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            No categories yet. Add one above to start budgeting your variable
            spending.
          </p>
        ) : (
          <ul className="space-y-2">
            {budgetCats.map((cat) => (
              <li key={cat.id} className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <Input
                    className="h-8 max-w-64 border-transparent bg-transparent px-1 text-sm font-medium shadow-none focus-visible:border-ring focus-visible:bg-background"
                    value={cat.name}
                    onChange={(e) =>
                      onUpdateCategoryBudget(cat.id, { name: e.target.value })
                    }
                    readOnly={Boolean(cat.categoryId)}
                  />
                  <div className="flex items-center gap-2">
                    <AmountStepper
                      variant="row"
                      valueCents={cat.cents}
                      onChangeCents={(cents) =>
                        onUpdateCategoryBudget(cat.id, { cents })
                      }
                      min={0}
                      max={CATEGORY_MAX}
                      step={500}
                      ariaLabel={`${cat.name} budget`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove category"
                      onClick={() => onRemoveCategoryBudget(cat.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 4 — Review                                                        */
/* ---------------------------------------------------------------------- */

function ReviewStep({
  preview,
  incomes,
  bills,
  budgetCats,
  savingsEnabled,
  onToggleSavings,
  savingsName,
  onChangeSavingsName,
  savingsAmount,
  onChangeSavingsAmount,
}: {
  preview: ReturnType<typeof waterfallBreakdown>;
  incomes: IncomeSource[];
  bills: Bill[];
  budgetCats: CategoryBudget[];
  savingsEnabled: boolean;
  onToggleSavings: () => void;
  savingsName: string;
  onChangeSavingsName: (v: string) => void;
  savingsAmount: string;
  onChangeSavingsAmount: (v: string) => void;
}) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight">
          Review your budget
        </h3>
        <p className="text-sm text-muted-foreground">
          Here&rsquo;s how the month plays out. You can fine-tune anything from
          the dashboard once it&rsquo;s active.
        </p>
      </header>

      <div className="rounded-2xl border bg-muted/20 p-4">
        <ul className="space-y-2 text-sm">
          <ReviewRow
            label="Monthly income"
            value={preview.incomeCents}
            tone="positive"
          />
          {incomes.length > 1 ? (
            <ul className="ml-3 space-y-0.5 text-xs text-muted-foreground">
              {incomes.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span>{s.label}</span>
                  <span className="tabular-nums">{formatUsd(s.cents)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ReviewRow
            label="Bills & utilities"
            value={-preview.fixedCents}
            tone="negative"
          />
          {bills.length > 0 ? (
            <ul className="ml-3 space-y-0.5 text-xs text-muted-foreground">
              {bills.map((b) => (
                <li key={b.id} className="flex justify-between">
                  <span>{b.name}</span>
                  <span className="tabular-nums">−{formatUsd(b.cents)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <Divider />
          <ReviewRow
            label="Amount left after bills"
            value={preview.afterFixedCents}
            tone="muted"
          />
          <ReviewRow
            label="Budget categories"
            value={-preview.flexibleCents}
            tone="negative"
          />
          {budgetCats.length > 0 ? (
            <ul className="ml-3 space-y-0.5 text-xs text-muted-foreground">
              {budgetCats.map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>{c.name}</span>
                  <span className="tabular-nums">−{formatUsd(c.cents)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {savingsEnabled && preview.savingsCents > 0 ? (
            <>
              <Divider />
              <ReviewRow
                label={savingsName || "Savings goals"}
                value={-preview.savingsCents}
                tone="negative"
              />
            </>
          ) : null}
          <Divider strong />
          <ReviewRow
            label="Projected savings"
            value={preview.projectedSavingsCents}
            tone={preview.projectedSavingsCents >= 0 ? "positive" : "negative"}
            strong
          />
        </ul>
      </div>

      <div className="rounded-2xl border bg-background p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={savingsEnabled}
            onCheckedChange={() => onToggleSavings()}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <span className="text-sm font-medium">
              Set a monthly savings target
            </span>
            <p className="text-xs text-muted-foreground">
              Optional. Like Rocket Money, this earmarks part of your projected
              savings as an explicit goal.
            </p>
          </div>
        </label>
        {savingsEnabled ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Goal name</Label>
              <Input
                value={savingsName}
                onChange={(e) => onChangeSavingsName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monthly amount (USD)</Label>
              <Input
                inputMode="decimal"
                value={savingsAmount}
                onChange={(e) => onChangeSavingsAmount(e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ReviewRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative" | "muted";
  strong?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-2",
        strong ? "text-base font-semibold" : "text-sm",
      )}
    >
      <span className={tone === "muted" ? "text-muted-foreground" : ""}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          tone === "positive" &&
            "text-emerald-700 dark:text-emerald-400",
          tone === "negative" && value !== 0 && "text-foreground",
        )}
      >
        {formatUsd(value)}
      </span>
    </li>
  );
}

function Divider({ strong = false }: { strong?: boolean }) {
  return (
    <li
      aria-hidden
      className={cn("my-1 h-px", strong ? "bg-border" : "bg-border/60")}
    />
  );
}
