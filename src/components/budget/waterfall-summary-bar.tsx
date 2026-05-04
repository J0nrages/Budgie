"use client";

import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

type Segment = {
  tier: "fixed" | "flexible" | "savings";
  budgetedCents: number;
  actualCents: number;
};

const LABEL: Record<Segment["tier"], string> = {
  fixed: "Fixed",
  flexible: "Flexible",
  savings: "Savings",
};

const COLOR: Record<Segment["tier"], string> = {
  fixed: "bg-sky-500",
  flexible: "bg-amber-500",
  savings: "bg-emerald-500",
};

export function WaterfallSummaryBar({
  incomeCents,
  segments,
  projectedSavingsCents,
}: {
  incomeCents: number;
  segments: Segment[];
  projectedSavingsCents: number;
}) {
  const total = Math.max(
    incomeCents,
    segments.reduce((sum, segment) => sum + segment.budgetedCents, 0),
    1,
  );

  return (
    <section
      className="space-y-2 rounded-lg border bg-card p-3"
      aria-label="Budget waterfall summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Waterfall summary</h3>
          <p className="text-xs text-muted-foreground">
            Income flows through fixed, flexible, savings, then projected
            savings.
          </p>
        </div>
        <div className="text-sm font-medium">{formatUsd(incomeCents)}</div>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full bg-muted">
        {segments.map((segment) => (
          <div
            key={segment.tier}
            className={cn("min-w-1", COLOR[segment.tier])}
            style={{
              width: `${Math.max((segment.budgetedCents / total) * 100, 1)}%`,
            }}
            title={`${LABEL[segment.tier]}: ${formatUsd(segment.budgetedCents)}`}
          />
        ))}
        {projectedSavingsCents > 0 ? (
          <div
            className="min-w-1 bg-muted-foreground/40"
            style={{
              width: `${Math.max((projectedSavingsCents / total) * 100, 1)}%`,
            }}
            title={`Projected savings: ${formatUsd(projectedSavingsCents)}`}
          />
        ) : null}
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
        {segments.map((segment) => (
          <div key={segment.tier} className="flex justify-between gap-2">
            <span className="flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-full", COLOR[segment.tier])} />
              {LABEL[segment.tier]}
            </span>
            <span>{formatUsd(segment.budgetedCents)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <span>Projected savings</span>
          <span>{formatUsd(projectedSavingsCents)}</span>
        </div>
      </div>
    </section>
  );
}
