"use client";

import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { formatUsd } from "@/lib/money";

type Point = {
  month: string;
  lineItemId: string;
  targetName: string;
  budgetedCents: number;
  actualCents: number;
};

function aggregateMonths(points: Point[] | undefined): {
  month: string;
  budgetedCents: number;
  actualCents: number;
}[] {
  if (!points || points.length === 0) return [];
  const map = new Map<
    string,
    { budgetedCents: number; actualCents: number }
  >();
  for (const p of points) {
    const cur = map.get(p.month) ?? { budgetedCents: 0, actualCents: 0 };
    cur.budgetedCents += p.budgetedCents;
    cur.actualCents += p.actualCents;
    map.set(p.month, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      budgetedCents: v.budgetedCents,
      actualCents: v.actualCents,
    }));
}

export function BudgetTrendChart({
  data,
  onMonthSelect,
}: {
  data: Point[] | undefined;
  onMonthSelect?: (month: string) => void;
}) {
  const lineOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const point of data ?? []) map.set(point.lineItemId, point.targetName);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [data]);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const filteredData = useMemo(() => {
    if (!data || selectedLineIds.size === 0) return data;
    return data.filter((point) => selectedLineIds.has(point.lineItemId));
  }, [data, selectedLineIds]);
  const chartData = useMemo(() => aggregateMonths(filteredData), [filteredData]);

  if (data === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spend vs budget trend</CardTitle>
        </CardHeader>
        <CardContent className="h-64 animate-pulse rounded-md bg-muted/40" />
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spend vs budget trend</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Not enough transaction history to chart trends yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Spend vs budget trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Monthly actuals vs budget. Toggle categories below and click a month to
          drill into the Budget tab.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto text-xs">
          {lineOptions.map((line) => {
            const checked =
              selectedLineIds.size === 0 || selectedLineIds.has(line.id);
            return (
              <label
                key={line.id}
                className="flex items-center gap-2 rounded-full border px-2 py-1"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(nextChecked) => {
                    setSelectedLineIds((prev) => {
                      const next = new Set(prev);
                      if (prev.size === 0) {
                        for (const option of lineOptions) next.add(option.id);
                      }
                      if (nextChecked) next.add(line.id);
                      else next.delete(line.id);
                      return next.size === lineOptions.length ? new Set() : next;
                    });
                  }}
                />
                {line.name}
              </label>
            );
          })}
        </div>
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              onClick={(state) => {
                const label = (state as { activeLabel?: unknown }).activeLabel;
                if (typeof label === "string") onMonthSelect?.(label);
              }}
            >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) =>
                formatUsd(Number(v)).replace("$", "")
              }
            />
            <Tooltip
              formatter={(value, name) => [
                formatUsd(Number(value)),
                name === "budgetedCents" ? "Budgeted" : "Actual",
              ]}
              labelFormatter={(label) => `Month ${label}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="budgetedCents"
              name="Budgeted"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="actualCents"
              name="Actual spend"
              stroke="var(--color-chart-2)"
              strokeWidth={2}
              dot={false}
            />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
