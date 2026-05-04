"use client";

import { useState } from "react";
import { Settings2, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetDashboard } from "@/components/budget/budget-dashboard";
import { BudgetSettingsSheet } from "@/components/budget/budget-settings-sheet";
import { BudgetTrendChart } from "@/components/budget/budget-trend-chart";
import { ScenarioPlanner } from "@/components/budget/scenario-planner";
import { BudgetWizard } from "@/components/budget/budget-wizard";
import { useBudgets } from "@/hooks/use-budgets";
import {
  useMonthlyBudgetVsActual,
  useWaterfallSummary,
  useBudgetTrendHistory,
} from "@/hooks/use-budget-reports";
import { useCategories } from "@/hooks/use-categories";
import { currentMonthYYYYMM, todayISO } from "@/lib/budget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function BudgetPlanner() {
  const { active } = useBudgets();
  const { seedFromTransactions } = useCategories();
  const [month, setMonth] = useState(() => currentMonthYYYYMM());
  const [asOf, setAsOf] = useState(() => todayISO());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subTab, setSubTab] = useState("budget");

  const budgetId = active?.budget._id;
  const monthly = useMonthlyBudgetVsActual(budgetId, month, asOf);
  const waterfall = useWaterfallSummary(budgetId, month, asOf);
  const trend = useBudgetTrendHistory(budgetId, 8);

  const ready = active !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Monthly budget</h2>
          <p className="text-sm text-muted-foreground">
            Compare planned limits to actual spending with pace and scenarios.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void seedFromTransactions({})}
          >
            <Sprout className="mr-1 h-4 w-4" />
            Seed categories
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="mr-1 h-4 w-4" />
            Budget settings
          </Button>
        </div>
      </div>

      {!ready ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : !budgetId ? (
        <BudgetWizard onComplete={() => setSubTab("budget")} />
      ) : (
        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList className="grid w-full grid-cols-3 sm:w-[360px]">
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          </TabsList>
          <TabsContent value="budget" className="pt-4">
            <BudgetDashboard
              month={month}
              onMonthChange={setMonth}
              asOfDate={asOf}
              onAsOfChange={setAsOf}
              monthly={monthly}
              waterfall={waterfall}
            />
          </TabsContent>
          <TabsContent value="trends" className="pt-4">
            <BudgetTrendChart
              data={trend}
              onMonthSelect={(m) => {
                setMonth(m);
                setSubTab("budget");
              }}
            />
          </TabsContent>
          <TabsContent value="scenarios" className="pt-4">
            <ScenarioPlanner budgetId={budgetId} />
          </TabsContent>
        </Tabs>
      )}

      <BudgetSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
