"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatUsd, parseUsdToCents } from "@/lib/money";
import { currentMonthYYYYMM } from "@/lib/budget";
import {
  useBudgetScenarios,
  useScenarioProjection,
} from "@/hooks/use-budget-scenarios";
import { useBudgetWithLineItems } from "@/hooks/use-budgets";
import { useCategories } from "@/hooks/use-categories";
import type { Doc, Id } from "convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Props = { budgetId: Id<"budgets"> };

export function ScenarioPlanner({ budgetId }: Props) {
  const { list, create, update, remove } = useBudgetScenarios(budgetId);
  const detail = useBudgetWithLineItems(budgetId);
  const { categories: allCategories, allGroups } = useCategories();
  const [scenarioPick, setScenarioPick] = useState<
    Id<"budgetScenarios"> | undefined
  >(undefined);

  const selectedId = useMemo(() => {
    if (!list || list.length === 0) return undefined;
    if (scenarioPick && list.some((s) => s._id === scenarioPick)) {
      return scenarioPick;
    }
    return list[0]._id;
  }, [list, scenarioPick]);

  const projection = useScenarioProjection(selectedId);

  const scenarioDoc = useMemo(
    () => list?.find((s) => s._id === selectedId),
    [list, selectedId],
  );

  const [newName, setNewName] = useState("What-if plan");
  const [newType, setNewType] = useState<"budgetTweak" | "lifeChange">(
    "budgetTweak",
  );
  const [newMonths, setNewMonths] = useState(8);
  const [newStart, setNewStart] = useState(() => currentMonthYYYYMM());

  const createScenario = useCallback(async () => {
    const id = await create({
      name: newName.trim() || "Scenario",
      baseBudgetId: budgetId,
      scenarioType: newType,
      lineItemOverrides: [],
      monthsToProject: newMonths,
      startMonth: newStart,
    });
    setScenarioPick(id);
  }, [budgetId, create, newMonths, newName, newStart, newType]);

  const chartPoints =
    projection?.points.map((p) => ({
      month: p.month,
      baseline: p.baselineBalanceCents,
      scenario: p.scenarioBalanceCents,
    })) ?? [];
  const finalPoint = chartPoints.at(-1);
  const finalDelta = finalPoint
    ? finalPoint.scenario - finalPoint.baseline
    : undefined;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Scenario planner</CardTitle>
        <p className="text-xs text-muted-foreground">
          Override limits or income to compare cumulative surplus vs baseline.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1">
            <Label>Scenario</Label>
            <Select
              value={selectedId ?? ""}
              onValueChange={(v) =>
                setScenarioPick(v as Id<"budgetScenarios">)
              }
              disabled={!list || list.length === 0}
            >
              <SelectTrigger className="w-[min(100%,280px)]">
                <SelectValue placeholder="Select scenario" />
              </SelectTrigger>
              <SelectContent>
                {(list ?? []).map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!selectedId}
            onClick={() =>
              selectedId &&
              void remove({ scenarioId: selectedId }).then(() =>
                setScenarioPick(undefined),
              )
            }
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-2 text-sm font-medium">New scenario</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="space-y-1">
              <Label htmlFor="sc-name">Name</Label>
              <Input
                id="sc-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-48"
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={newType}
                onValueChange={(v) =>
                  setNewType(v as "budgetTweak" | "lifeChange")
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="budgetTweak">Budget tweak</SelectItem>
                  <SelectItem value="lifeChange">Life change</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-months">Months</Label>
              <Input
                id="sc-months"
                type="number"
                min={1}
                max={24}
                className="w-24"
                value={newMonths}
                onChange={(e) => setNewMonths(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-start">Start month</Label>
              <Input
                id="sc-start"
                type="month"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="sm:mt-6"
              variant="secondary"
              onClick={() => void createScenario()}
            >
              Create
            </Button>
          </div>
        </div>

        {selectedId && scenarioDoc ? (
          <>
            <ScenarioDraftPanel
              key={scenarioDoc._id}
              scenario={scenarioDoc}
              detail={detail}
              allCategories={allCategories}
              allGroups={allGroups}
              update={update}
            />

            <Separator />

            <div>
              <p className="mb-2 text-sm font-medium">
                Projected cumulative balance
              </p>
              {projection === undefined ? (
                <Skeleton className="h-56 w-full rounded-lg" />
              ) : chartPoints.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing to chart.
                </p>
              ) : (
                <>
                  {finalPoint && finalDelta !== undefined ? (
                    <div className="mb-3 grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Baseline ending balance
                        </div>
                        <div className="font-medium">
                          {formatUsd(finalPoint.baseline)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Scenario ending balance
                        </div>
                        <div className="font-medium">
                          {formatUsd(finalPoint.scenario)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Scenario delta
                        </div>
                        <div
                          className={
                            finalDelta >= 0
                              ? "font-medium text-emerald-600 dark:text-emerald-400"
                              : "font-medium text-destructive"
                          }
                        >
                          {formatUsd(finalDelta)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="h-56 w-full pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartPoints}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) =>
                            formatUsd(Number(v)).replace("$", "")
                          }
                        />
                        <Tooltip formatter={(value) => formatUsd(Number(value))} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="baseline"
                          name="Baseline"
                          stroke="var(--color-chart-1)"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="scenario"
                          name="Scenario"
                          stroke="var(--color-chart-2)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
              {projection?.breakEvenMonth ? (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Scenario dips negative around {projection.breakEvenMonth}.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Create a scenario to edit overrides and see projected balances.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ScenarioDraftPanel({
  scenario,
  detail,
  allCategories,
  allGroups,
  update,
}: {
  scenario: Doc<"budgetScenarios">;
  detail: ReturnType<typeof useBudgetWithLineItems>;
  allCategories: Doc<"categories">[] | undefined;
  allGroups: Doc<"categoryGroups">[] | undefined;
  update: (args: {
    scenarioId: Id<"budgetScenarios">;
    lineItemOverrides: {
      lineItemId: Id<"budgetLineItems">;
      limitCents: number;
    }[];
    incomeOverrideCents?: number;
    additionalExpensesCents?: number;
    removedExpensesCents?: number;
  }) => Promise<unknown>;
}) {
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>(
    () => {
      const map: Record<string, string> = {};
      for (const o of scenario.lineItemOverrides) {
        map[o.lineItemId] = (o.limitCents / 100).toFixed(2);
      }
      return map;
    },
  );
  const [incomeDraft, setIncomeDraft] = useState(
    () =>
      scenario.incomeOverrideCents !== undefined
        ? (scenario.incomeOverrideCents / 100).toFixed(2)
        : "",
  );
  const [additionalDraft, setAdditionalDraft] = useState(
    () =>
      scenario.additionalExpensesCents !== undefined
        ? (scenario.additionalExpensesCents / 100).toFixed(2)
        : "",
  );
  const [removedDraft, setRemovedDraft] = useState(
    () =>
      scenario.removedExpensesCents !== undefined
        ? (scenario.removedExpensesCents / 100).toFixed(2)
        : "",
  );

  const saveScenario = useCallback(async () => {
    if (!detail) return;
    const overrides: {
      lineItemId: Id<"budgetLineItems">;
      limitCents: number;
    }[] = [];
    for (const li of detail.lineItems) {
      const raw = overrideDraft[li._id]?.trim();
      if (!raw) continue;
      const cents = parseUsdToCents(raw);
      if (cents === null || cents < 0) continue;
      overrides.push({ lineItemId: li._id, limitCents: cents });
    }
    const income =
      incomeDraft.trim().length > 0 ? parseUsdToCents(incomeDraft) : undefined;
    const add =
      additionalDraft.trim().length > 0
        ? parseUsdToCents(additionalDraft)
        : undefined;
    const rem =
      removedDraft.trim().length > 0
        ? parseUsdToCents(removedDraft)
        : undefined;

    await update({
      scenarioId: scenario._id,
      lineItemOverrides: overrides,
      incomeOverrideCents:
        income !== null && income !== undefined ? income : undefined,
      additionalExpensesCents:
        add !== null && add !== undefined ? add : undefined,
      removedExpensesCents: rem !== null && rem !== undefined ? rem : undefined,
    });
  }, [
    additionalDraft,
    detail,
    incomeDraft,
    overrideDraft,
    removedDraft,
    scenario._id,
    update,
  ]);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Line overrides (monthly limit, USD)</Label>
          <Button type="button" size="sm" onClick={() => void saveScenario()}>
            Save overrides
          </Button>
        </div>
        {!detail ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : (
          <ScrollArea className="h-48 rounded-md border px-2 py-2">
            <div className="space-y-2 pr-2">
              {detail.lineItems.map((li) => {
                const name = li.categoryId
                  ? allCategories?.find((c) => c._id === li.categoryId)?.name ??
                    "Category"
                  : li.categoryGroupId
                    ? allGroups?.find((g) => g._id === li.categoryGroupId)
                        ?.name ?? "Group"
                    : "Line";
                return (
                  <div
                    key={li._id}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="min-w-[120px] flex-1 font-medium">
                      {name}
                    </span>
                    <Input
                      className="w-28"
                      placeholder={(li.limitCents / 100).toFixed(2)}
                      value={overrideDraft[li._id] ?? ""}
                      onChange={(e) =>
                        setOverrideDraft((d) => ({
                          ...d,
                          [li._id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
              {detail.lineItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add budget lines first in Budget settings.
                </p>
              ) : null}
            </div>
          </ScrollArea>
        )}
      </div>

      {scenario.scenarioType === "lifeChange" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Income override (USD / mo)</Label>
            <Input
              value={incomeDraft}
              onChange={(e) => setIncomeDraft(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <Label>Additional expenses (USD / mo)</Label>
            <Input
              value={additionalDraft}
              onChange={(e) => setAdditionalDraft(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <Label>Removed expenses (USD / mo)</Label>
            <Input
              value={removedDraft}
              onChange={(e) => setRemovedDraft(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
