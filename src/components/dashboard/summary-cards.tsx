"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccountLike, TransactionLike } from "@/lib/ledger";
import { buildAccountLedger, netWorthCents } from "@/lib/ledger";
import { formatUsd } from "@/lib/money";
import {
  buildFlowTrend,
  buildNetWorthTrend,
  currentFlowPeriodTotal,
  type FlowPeriod,
} from "@/lib/trends";
import type { Basis } from "@/types/finance";
import { MetricCard } from "./metric-card";

type Props = {
  accounts: AccountLike[];
  transactions: TransactionLike[];
  basis: Basis;
};

export function SummaryCards({ accounts, transactions, basis }: Props) {
  const [flowPeriod, setFlowPeriod] = useState<FlowPeriod>("daily");
  const nw = netWorthCents(accounts, transactions, basis);
  const netWorthTrend = buildNetWorthTrend(accounts, transactions, basis);
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

  const assets = accounts.filter((a) => a.type === "asset");
  const liabilities = accounts.filter((a) => a.type === "liability");

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

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Overview</p>
          <p className="text-xs text-muted-foreground">
            Income and expenses use the selected flow window.
          </p>
        </div>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Net worth"
          description="All accounts, current basis"
          value={formatUsd(nw)}
          hint="Liabilities are stored as negative balances."
          chartData={netWorthTrend.map((point) => point.valueCents)}
          chartTone="sky"
        />
        <MetricCard
          title="Assets"
          value={formatUsd(assetsTotal)}
        />
        <MetricCard
          title="Liabilities"
          value={formatUsd(liabilitiesTotal)}
        />
        <MetricCard
          title={`Income (${flowPeriod})`}
          description={`${basis} basis`}
          value={formatUsd(income)}
          hint={incomeTrend.at(-1)?.label ?? "No income in this window."}
          chartData={incomeTrend.map((point) => point.valueCents)}
          chartTone="emerald"
        />
        <MetricCard
          title={`Expenses (${flowPeriod})`}
          description={`${basis} basis`}
          value={formatUsd(expense)}
          hint={expenseTrend.at(-1)?.label ?? "No expenses in this window."}
          chartData={expenseTrend.map((point) => point.valueCents)}
          chartTone="rose"
        />
      </div>
    </div>
  );
}
