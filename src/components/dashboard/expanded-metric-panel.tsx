"use client";

import { motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AccountLike, TransactionLike } from "@/lib/ledger";
import { transactionBasisDate } from "@/lib/ledger";
import {
  inclusiveDaySpan,
  transactionsForExpandedMetricRange,
  type ExpandedMetricKind,
} from "@/lib/metric-transactions";
import { formatUsd } from "@/lib/money";
import type { TrendPoint } from "@/lib/trends";
import type { Basis, TransactionType } from "@/types/finance";
import {
  InteractiveChart,
  type ChartVisibleRange,
} from "./interactive-chart";

export type ExpandedMetricCardData = {
  layoutKey: string;
  title: string;
  description?: string;
  value: string;
  hint?: string;
  trendData: TrendPoint[];
  chartTone: "emerald" | "rose" | "sky" | "slate";
  metricKind: ExpandedMetricKind;
  accountId?: string;
};

type Props = {
  card: ExpandedMetricCardData;
  transactions: TransactionLike[];
  accounts: AccountLike[];
  basis: Basis;
  onClose: () => void;
};

/** Show ledger list only when the brush covers a short calendar window. */
const TRANSACTION_LIST_MAX_SPAN_DAYS = 3;

function basisDateLabel(tx: TransactionLike, basis: Basis): string {
  const d = transactionBasisDate(tx, basis);
  return d ? d.slice(5) : "—";
}

function amountToneClass(type: TransactionType): string {
  if (type === "income" || type === "payment") {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (
    type === "expense" ||
    type === "fee" ||
    type === "interest"
  ) {
    return "text-rose-600 dark:text-rose-400";
  }
  if (type === "transfer") {
    return "text-muted-foreground";
  }
  return "text-foreground";
}

export function ExpandedMetricPanel({
  card,
  transactions,
  accounts,
  basis,
  onClose,
}: Props) {
  const [visibleRange, setVisibleRange] = useState<ChartVisibleRange | null>(
    null,
  );
  const onVisibleRangeChange = useCallback((range: ChartVisibleRange | null) => {
    setVisibleRange(range);
  }, []);

  const listWindow = useMemo(() => {
    if (!visibleRange) return null;
    const span = inclusiveDaySpan(
      visibleRange.startDate,
      visibleRange.endDate,
    );
    if (span > TRANSACTION_LIST_MAX_SPAN_DAYS) return null;
    return { startDate: visibleRange.startDate, endDate: visibleRange.endDate };
  }, [visibleRange]);

  const visibleTransactions = useMemo(() => {
    if (!listWindow) return [];
    return transactionsForExpandedMetricRange(
      transactions,
      accounts,
      basis,
      card.metricKind,
      card.accountId,
      listWindow.startDate,
      listWindow.endDate,
    );
  }, [
    listWindow,
    transactions,
    accounts,
    basis,
    card.metricKind,
    card.accountId,
  ]);

  const rangeHint = useMemo(() => {
    if (!visibleRange) return null;
    const span = inclusiveDaySpan(
      visibleRange.startDate,
      visibleRange.endDate,
    );
    if (span <= TRANSACTION_LIST_MAX_SPAN_DAYS) return null;
    return "Narrow the range with the slider under the chart to list transactions.";
  }, [visibleRange]);
  return (
    <motion.section
      layoutId={card.layoutKey}
      layout="position"
      className="flex h-[calc(100dvh-14rem)] min-h-[22rem] flex-col overflow-hidden rounded-2xl bg-card text-card-foreground ring-1 ring-foreground/10"
      aria-label={`${card.title} expanded chart`}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4 text-left">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-heading text-lg leading-tight font-medium">
            {card.title}
          </h2>
          {card.description ? (
            <p className="text-sm text-muted-foreground">{card.description}</p>
          ) : null}
          <p className="font-mono text-3xl tabular-nums tracking-tight text-foreground">
            {card.value}
          </p>
          {card.hint ? (
            <p className="text-xs text-muted-foreground">{card.hint}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={onClose}
          autoFocus
        >
          <XIcon />
          <span className="sr-only">Collapse expanded chart</span>
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className="min-h-0 flex-1">
          <InteractiveChart
            key={card.layoutKey}
            trendData={card.trendData}
            chartTone={card.chartTone}
            resetBrushKey={card.layoutKey}
            onVisibleRangeChange={onVisibleRangeChange}
          />
        </div>
        <div className="shrink-0 border-t border-border/50 pt-3">
          {rangeHint ? (
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              {rangeHint}
            </p>
          ) : listWindow ? (
            <div className="space-y-2">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Transactions
              </p>
              <ScrollArea className="h-36 rounded-xl border border-border/40 bg-muted/20">
                {visibleTransactions.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No transactions in this range.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/40 px-1 py-0.5">
                    {visibleTransactions.map((tx) => (
                      <li
                        key={tx._id}
                        className="flex items-start gap-3 px-2 py-2 text-xs"
                      >
                        <span className="w-11 shrink-0 tabular-nums text-muted-foreground">
                          {basisDateLabel(tx, basis)}
                        </span>
                        <span className="min-w-0 flex-1 leading-snug text-foreground">
                          {tx.description}
                        </span>
                        <span
                          className={`shrink-0 tabular-nums font-medium ${amountToneClass(tx.type)}`}
                        >
                          {formatUsd(tx.amountCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
