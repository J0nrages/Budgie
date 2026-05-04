"use client";

import { useEffect, useState } from "react";
import { LayoutGroup } from "motion/react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { AccountLike, TransactionLike } from "@/lib/ledger";
import { buildAccountLedger, netWorthCents } from "@/lib/ledger";
import { formatUsd } from "@/lib/money";
import {
  buildFlowTrend,
  buildNetWorthTrend,
  currentFlowPeriodTotal,
  type FlowPeriod,
  type TrendPoint,
} from "@/lib/trends";
import type { ExpandedMetricKind } from "@/lib/metric-transactions";
import type { Basis } from "@/types/finance";
import { BudgetPlanner } from "@/components/budget/budget-planner";
import { ExpandedMetricPanel } from "./expanded-metric-panel";
import { MetricCard } from "./metric-card";

type Props = {
  accounts: AccountLike[];
  transactions: TransactionLike[];
  basis: Basis;
};

function formatAsOf(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type MetricCardRow = {
  key: string;
  title: string;
  description?: string;
  value: string;
  hint?: string;
  chartData: number[];
  chartTone: "emerald" | "rose" | "sky" | "slate";
  trendData: TrendPoint[];
  metricKind: ExpandedMetricKind;
  accountId?: string;
};

export function SummaryCards({ accounts, transactions, basis }: Props) {
  const [flowPeriod, setFlowPeriod] = useState<FlowPeriod>("daily");
  const [activeTab, setActiveTab] = useState("overview");
  const [asOf, setAsOf] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const assets = accounts.filter((a) => a.type === "asset");
  const liabilities = accounts.filter((a) => a.type === "liability");

  useEffect(() => {
    const update = () => setAsOf(formatAsOf(new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const nw = netWorthCents(accounts, transactions, basis);
  const netWorthTrend = buildNetWorthTrend(accounts, transactions, basis);
  const assetsTrend = buildNetWorthTrend(assets, transactions, basis);
  const liabilitiesTrend = buildNetWorthTrend(liabilities, transactions, basis);
  const incomeTrend = buildFlowTrend(
    transactions,
    basis,
    flowPeriod,
    "income",
  );
  const expenseTrend = buildFlowTrend(
    transactions,
    basis,
    flowPeriod,
    "expense",
  );
  const income = currentFlowPeriodTotal(
    transactions,
    basis,
    flowPeriod,
    "income",
  );
  const expense = currentFlowPeriodTotal(
    transactions,
    basis,
    flowPeriod,
    "expense",
  );

  const sumBalances = (list: AccountLike[]) =>
    list.reduce((sum, a) => {
      const lines = buildAccountLedger(a, transactions, basis);
      const bal =
        lines.length === 0
          ? a.initialBalanceCents
          : lines[0].runningBalanceCents;
      return sum + bal;
    }, 0);

  const assetsTotal = sumBalances(assets);
  const liabilitiesTotal = sumBalances(liabilities);
  const chartValues = (trend: typeof netWorthTrend, fallback: number) =>
    trend.length > 0 ? trend.map((point) => point.valueCents) : [fallback];
  const accountCards: MetricCardRow[] = accounts.map((account) => {
    const balance = sumBalances([account]);
    const trend = buildNetWorthTrend([account], transactions, basis);

    return {
      key: account._id,
      title: account.name,
      description:
        account.type === "asset" ? "Asset account" : "Liability account",
      value: formatUsd(
        account.type === "liability" ? Math.abs(balance) : balance,
      ),
      hint: asOf ? `As of ${asOf}` : "As of now",
      chartData: chartValues(trend, balance),
      chartTone: account.type === "asset" ? "emerald" : "rose",
      trendData: trend,
      metricKind: "account",
      accountId: account._id,
    };
  });

  const cards: MetricCardRow[] = [
    {
      key: "net-worth",
      title: "Net worth",
      description: "All accounts, current basis",
      value: formatUsd(nw),
      hint: "Liabilities are stored as negative balances.",
      chartData: chartValues(netWorthTrend, nw),
      chartTone: "sky",
      trendData: netWorthTrend,
      metricKind: "net-worth",
    },
    {
      key: "assets",
      title: "Assets",
      value: formatUsd(assetsTotal),
      chartData: chartValues(assetsTrend, assetsTotal),
      chartTone: "emerald",
      trendData: assetsTrend,
      metricKind: "assets",
    },
    {
      key: "liabilities",
      title: "Liabilities",
      value: formatUsd(liabilitiesTotal),
      chartData: chartValues(liabilitiesTrend, liabilitiesTotal),
      chartTone: "rose",
      trendData: liabilitiesTrend,
      metricKind: "liabilities",
    },
    {
      key: "income",
      title: `Income (${flowPeriod})`,
      description: `${basis} basis`,
      value: formatUsd(income),
      hint: incomeTrend.at(-1)?.label ?? "No income in this window.",
      chartData: chartValues(incomeTrend, income),
      chartTone: "emerald",
      trendData: incomeTrend,
      metricKind: "income",
    },
    {
      key: "expenses",
      title: `Expenses (${flowPeriod})`,
      description: `${basis} basis`,
      value: formatUsd(expense),
      hint: expenseTrend.at(-1)?.label ?? "No expenses in this window.",
      chartData: chartValues(expenseTrend, expense),
      chartTone: "rose",
      trendData: expenseTrend,
      metricKind: "expenses",
    },
  ];

  const expandedCard =
    expandedKey === null
      ? null
      : [...cards, ...accountCards].find((c) => c.key === expandedKey) ?? null;
  const expandedOverviewCard =
    expandedCard && cards.some((row) => row.key === expandedCard.key)
      ? expandedCard
      : null;
  const expandedAccountCard =
    expandedCard && accountCards.some((row) => row.key === expandedCard.key)
      ? expandedCard
      : null;

  const handleTabChange = (value: string) => {
    setExpandedKey(null);
    setActiveTab(value);
  };

  return (
    <LayoutGroup id="dashboard-metric-cards">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col gap-3 border-b pb-2 sm:flex-row sm:items-center sm:justify-between">
          <TabsList variant="line" className="h-auto p-0">
            <TabsTrigger
              value="overview"
              className="px-4 py-2 text-base data-active:after:bottom-[-9px]"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="accounts"
              className="px-4 py-2 text-base data-active:after:bottom-[-9px]"
            >
              Accounts
            </TabsTrigger>
            <TabsTrigger
              value="planner"
              className="px-4 py-2 text-base data-active:after:bottom-[-9px]"
            >
              Planner
            </TabsTrigger>
          </TabsList>
          {activeTab === "overview" ? (
            <Tabs
              value={flowPeriod}
              onValueChange={(value) => setFlowPeriod(value as FlowPeriod)}
            >
              <TabsList className="grid w-full grid-cols-3 sm:w-[260px]">
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
        </div>

        <TabsContent value="overview" className="space-y-3 pt-2">
          {expandedOverviewCard ? (
            <ExpandedMetricPanel
              card={{
                layoutKey: expandedOverviewCard.key,
                title: expandedOverviewCard.title,
                description: expandedOverviewCard.description,
                value: expandedOverviewCard.value,
                hint: expandedOverviewCard.hint,
                trendData: expandedOverviewCard.trendData,
                chartTone: expandedOverviewCard.chartTone,
                metricKind: expandedOverviewCard.metricKind,
                accountId: expandedOverviewCard.accountId,
              }}
              transactions={transactions}
              accounts={accounts}
              basis={basis}
              onClose={() => setExpandedKey(null)}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Income and expenses use the selected flow window.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((row) => (
                  <MetricCard
                    key={row.key}
                    layoutId={row.key}
                    title={row.title}
                    description={row.description}
                    value={row.value}
                    hint={row.hint}
                    chartData={row.chartData}
                    chartTone={row.chartTone}
                    onClick={() => setExpandedKey(row.key)}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="accounts" className="pt-2">
          {accountCards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accounts yet. Create one to get started.
            </p>
          ) : expandedAccountCard ? (
            <ExpandedMetricPanel
              card={{
                layoutKey: expandedAccountCard.key,
                title: expandedAccountCard.title,
                description: expandedAccountCard.description,
                value: expandedAccountCard.value,
                hint: expandedAccountCard.hint,
                trendData: expandedAccountCard.trendData,
                chartTone: expandedAccountCard.chartTone,
                metricKind: expandedAccountCard.metricKind,
                accountId: expandedAccountCard.accountId,
              }}
              transactions={transactions}
              accounts={accounts}
              basis={basis}
              onClose={() => setExpandedKey(null)}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accountCards.map((row) => (
                <MetricCard
                  key={row.key}
                  layoutId={row.key}
                  title={row.title}
                  description={row.description}
                  value={row.value}
                  hint={row.hint}
                  chartData={row.chartData}
                  chartTone={row.chartTone}
                  onClick={() => setExpandedKey(row.key)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="planner" className="pt-2">
          <BudgetPlanner />
        </TabsContent>
      </Tabs>
    </LayoutGroup>
  );
}
