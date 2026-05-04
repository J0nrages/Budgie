"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBudgets, useBudgetWithLineItems } from "@/hooks/use-budgets";
import { useCategories } from "@/hooks/use-categories";
import { useDetectMonthlyIncome } from "@/hooks/use-budget-reports";
import { formatUsd, parseUsdToCents } from "@/lib/money";
import { currentMonthYYYYMM } from "@/lib/budget";
import type { Doc, Id } from "convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowDown, ArrowUp, Star, Trash2 } from "lucide-react";
import { CategoryManager } from "@/components/budget/category-manager";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BudgetSettingsSheet({ open, onOpenChange }: Props) {
  const {
    list,
    active,
    historicalAverages,
    create,
    update,
    remove,
    setActive,
    createLineItem,
    removeLineItem,
    reorderLineItems,
  } = useBudgets();

  const incomeHint = useDetectMonthlyIncome(6);

  const [budgetPick, setBudgetPick] = useState<Id<"budgets"> | undefined>(
    undefined,
  );

  const selectedBudgetId = useMemo(() => {
    if (!list || list.length === 0) return undefined;
    if (budgetPick && list.some((b) => b._id === budgetPick)) {
      return budgetPick;
    }
    return active?.budget._id ?? list[0]._id;
  }, [list, budgetPick, active?.budget._id]);

  const detail = useBudgetWithLineItems(
    open ? selectedBudgetId : undefined,
  );

  const { allGroups: groups, categories, seedFromTransactions } =
    useCategories();

  const [createName, setCreateName] = useState("Main budget");
  const [createIncome, setCreateIncome] = useState("4000");
  const [createFrom, setCreateFrom] = useState(() => currentMonthYYYYMM());

  const createBudget = useCallback(async () => {
    const cents = parseUsdToCents(createIncome);
    if (cents === null || cents < 0) return;
    const id = await create({
      name: createName.trim() || "Budget",
      monthlyIncomeCents: cents,
      effectiveFrom: createFrom,
      lineItems: [],
    });
    await setActive({ budgetId: id });
    setBudgetPick(id);
    setCreateName("Main budget");
  }, [create, createFrom, createIncome, createName, setActive]);

  const saveBudgetMeta = useCallback(
    async (patch: {
      name: string;
      monthlyIncomeCents: number;
      effectiveFrom: string;
    }) => {
      if (!selectedBudgetId) return;
      await update({
        budgetId: selectedBudgetId,
        name: patch.name,
        monthlyIncomeCents: patch.monthlyIncomeCents,
        effectiveFrom: patch.effectiveFrom,
      });
    },
    [selectedBudgetId, update],
  );

  const [targetKind, setTargetKind] = useState<"category" | "group">(
    "category",
  );
  const [categoryId, setCategoryId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [limitStr, setLimitStr] = useState("100");
  const [targetType, setTargetType] = useState<
    "spending" | "savingsBalance" | "monthlyBuilder"
  >("spending");
  const [cadence, setCadence] = useState<
    "weekly" | "monthly" | "yearly" | "byDate"
  >("monthly");
  const [refillBehavior, setRefillBehavior] = useState<
    "setAside" | "refillUpTo"
  >("setAside");
  const [rolloverUnused, setRolloverUnused] = useState(false);

  const addLine = useCallback(async () => {
    if (!selectedBudgetId) return;
    const cents = parseUsdToCents(limitStr);
    if (cents === null || cents < 0) return;
    await createLineItem({
      budgetId: selectedBudgetId,
      categoryId:
        targetKind === "category"
          ? (categoryId as Id<"categories">)
          : undefined,
      categoryGroupId:
        targetKind === "group"
          ? (groupId as Id<"categoryGroups">)
          : undefined,
      targetType,
      limitCents: cents,
      cadence,
      refillBehavior,
      rolloverUnused,
    });
    setLimitStr("100");
  }, [
    cadence,
    categoryId,
    createLineItem,
    refillBehavior,
    groupId,
    limitStr,
    rolloverUnused,
    selectedBudgetId,
    targetKind,
    targetType,
  ]);

  const avgForCategory = useCallback(
    (cid: Id<"categories">) => {
      if (!historicalAverages) return null;
      const row = historicalAverages.find((r) => r.categoryId === cid);
      return row?.averageCents ?? null;
    },
    [historicalAverages],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Budget settings</SheetTitle>
          <SheetDescription>
            Monthly income, activation, and category or group budget lines.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 px-4 pb-6">
          {!list || list.length === 0 ? (
            <section className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Create your first budget. Add category lines after saving.
              </p>
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Monthly income (USD)</Label>
                <Input
                  value={createIncome}
                  onChange={(e) => setCreateIncome(e.target.value)}
                />
                {incomeHint != null &&
                incomeHint.suggestedMonthlyIncomeCents > 0 ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() =>
                      setCreateIncome(
                        (
                          incomeHint.suggestedMonthlyIncomeCents / 100
                        ).toFixed(2),
                      )
                    }
                  >
                    Use detected{" "}
                    {formatUsd(incomeHint.suggestedMonthlyIncomeCents)} / mo
                  </Button>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>Effective from</Label>
                <Input
                  type="month"
                  value={createFrom}
                  onChange={(e) => setCreateFrom(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => void createBudget()}>
                Create budget
              </Button>
            </section>
          ) : (
            <>
              <section className="space-y-2">
                <Label>Budget</Label>
                <Select
                  value={selectedBudgetId ?? ""}
                  onValueChange={(v) => setBudgetPick(v as Id<"budgets">)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((b) => (
                      <SelectItem key={b._id} value={b._id}>
                        {b.name}
                        {b.isActive ? " ★" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      !selectedBudgetId ||
                      active?.budget._id === selectedBudgetId
                    }
                    onClick={() =>
                      selectedBudgetId &&
                      void setActive({ budgetId: selectedBudgetId })
                    }
                  >
                    <Star className="mr-1 h-4 w-4" />
                    Make active
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void seedFromTransactions({})}
                  >
                    Seed categories from transactions
                  </Button>
                </div>
              </section>

              {detail ? (
                <>
                  <Separator />
                  <BudgetDetailFields
                    key={detail.budget._id}
                    budget={detail.budget}
                    onSave={saveBudgetMeta}
                  />

                  <Separator />
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium">Add line item</h3>
                    <div className="space-y-1">
                      <Label>Target</Label>
                      <Select
                        value={targetKind}
                        onValueChange={(v) =>
                          setTargetKind(v as "category" | "group")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="category">Category</SelectItem>
                          <SelectItem value="group">
                            Category group pool
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {targetKind === "category" ? (
                      <div className="space-y-1">
                        <Label>Category</Label>
                        <Select
                          value={categoryId}
                          onValueChange={setCategoryId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose category" />
                          </SelectTrigger>
                          <SelectContent>
                            {(categories ?? []).map((c) => {
                              const avg = avgForCategory(c._id);
                              return (
                                <SelectItem key={c._id} value={c._id}>
                                  {c.name}
                                  {avg !== null ? ` · avg ${formatUsd(avg)}` : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label>Group</Label>
                        <Select value={groupId} onValueChange={setGroupId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose group" />
                          </SelectTrigger>
                          <SelectContent>
                            {(groups ?? []).map((g) => (
                              <SelectItem key={g._id} value={g._id}>
                                {g.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label>Target type</Label>
                      <Select
                        value={targetType}
                        onValueChange={(v) =>
                          setTargetType(
                            v as "spending" | "savingsBalance" | "monthlyBuilder",
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="spending">
                            Needed for Spending
                          </SelectItem>
                          <SelectItem value="savingsBalance">
                            Savings Balance Target
                          </SelectItem>
                          <SelectItem value="monthlyBuilder">
                            Monthly Savings Builder
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Limit (USD per cadence)</Label>
                      <Input
                        value={limitStr}
                        onChange={(e) => setLimitStr(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Cadence</Label>
                      <Select
                        value={cadence}
                        onValueChange={(v) =>
                          setCadence(
                            v as "weekly" | "monthly" | "yearly" | "byDate",
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                          <SelectItem value="byDate">By target date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Refill behavior</Label>
                      <Select
                        value={refillBehavior}
                        onValueChange={(v) =>
                          setRefillBehavior(v as "setAside" | "refillUpTo")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="setAside">
                            Set aside another
                          </SelectItem>
                          <SelectItem value="refillUpTo">
                            Refill up to target
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rolloverUnused}
                        onChange={(e) => setRolloverUnused(e.target.checked)}
                      />
                      Rollover unused amount
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void addLine()}
                      disabled={
                        targetKind === "category" ? !categoryId : !groupId
                      }
                    >
                      Add line
                    </Button>
                  </section>

                  <Separator />
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">Line items</h3>
                    <ScrollArea className="h-56 rounded-md border">
                      <div className="space-y-2 p-3">
                        {detail.lineItems.map((li, index) => (
                          <div
                            key={li._id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <div>
                              <div className="font-medium">
                                {li.categoryId
                                  ? categories?.find((c) => c._id === li.categoryId)
                                      ?.name ?? "Category"
                                  : groups?.find(
                                      (g) => g._id === li.categoryGroupId,
                                    )?.name ?? "Group"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatUsd(li.limitCents)} / {li.cadence} ·{" "}
                                {li.targetType} · {li.refillBehavior}
                                {li.rolloverUnused ? " · rollover" : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Move line up"
                                disabled={index === 0}
                                onClick={() => {
                                  const ordered = detail.lineItems.map(
                                    (line) => line._id,
                                  );
                                  const [item] = ordered.splice(index, 1);
                                  ordered.splice(index - 1, 0, item);
                                  void reorderLineItems({
                                    budgetId: detail.budget._id,
                                    orderedLineItemIds: ordered,
                                  });
                                }}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Move line down"
                                disabled={index === detail.lineItems.length - 1}
                                onClick={() => {
                                  const ordered = detail.lineItems.map(
                                    (line) => line._id,
                                  );
                                  const [item] = ordered.splice(index, 1);
                                  ordered.splice(index + 1, 0, item);
                                  void reorderLineItems({
                                    budgetId: detail.budget._id,
                                    orderedLineItemIds: ordered,
                                  });
                                }}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Remove line"
                                onClick={() =>
                                  void removeLineItem({ lineItemId: li._id })
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {detail.lineItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No lines yet.
                          </p>
                        ) : null}
                      </div>
                    </ScrollArea>
                  </section>

                  <Separator />
                  <CategoryManager />

                  <Separator />
                  <section>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={detail.budget.isActive}
                      onClick={() =>
                        void remove({ budgetId: detail.budget._id }).then(() =>
                          onOpenChange(false),
                        )
                      }
                    >
                      Delete budget (must not be active)
                    </Button>
                  </section>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BudgetDetailFields({
  budget,
  onSave,
}: {
  budget: Doc<"budgets">;
  onSave: (patch: {
    name: string;
    monthlyIncomeCents: number;
    effectiveFrom: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(budget.name);
  const [income, setIncome] = useState(
    (budget.monthlyIncomeCents / 100).toFixed(2),
  );
  const [from, setFrom] = useState(budget.effectiveFrom);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Budget details</h3>
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Monthly income (USD)</Label>
        <Input value={income} onChange={(e) => setIncome(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Effective from (month)</Label>
        <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          const cents = parseUsdToCents(income);
          if (cents === null || cents < 0) return;
          void onSave({
            name: name.trim(),
            monthlyIncomeCents: cents,
            effectiveFrom: from,
          });
        }}
      >
        Save budget
      </Button>
    </section>
  );
}
