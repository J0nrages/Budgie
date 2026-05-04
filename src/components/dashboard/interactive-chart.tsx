"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/lib/money";
import type { TrendPoint } from "@/lib/trends";

const TONE_COLORS = {
  emerald: { stroke: "#10b981", fill: "#10b981" },
  rose: { stroke: "#f43f5e", fill: "#f43f5e" },
  sky: { stroke: "#0ea5e9", fill: "#0ea5e9" },
  slate: { stroke: "#64748b", fill: "#64748b" },
} as const;

type ChartTone = keyof typeof TONE_COLORS;

export type ChartVisibleRange = {
  startDate: string;
  endDate: string;
  startIndex: number;
  endIndex: number;
};

type Props = {
  trendData: TrendPoint[];
  chartTone: ChartTone;
  /** When this changes (e.g. expanded card id), visible range resets to full series */
  resetBrushKey?: string;
  onVisibleRangeChange?: (range: ChartVisibleRange | null) => void;
};

type ViewState = {
  viewKey: string;
  startMs: number;
  spanMs: number;
};

const DAY_MS = 86_400_000;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function rangeLabel(range: ChartVisibleRange | null): string {
  if (!range) return "No range";
  if (range.startDate === range.endDate) return range.startDate;
  return `${range.startDate} to ${range.endDate}`;
}

function parseIsoDateMs(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatShortDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

function formatSpan(ms: number, fullMs: number): string {
  if (Math.abs(ms - fullMs) < DAY_MS / 2) return "Full";
  const days = Math.max(1, Math.round(ms / DAY_MS));
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (days < 60) return `${weeks}w`;
  const months = Math.round(days / 30);
  return `${months}mo`;
}

function paddedValueDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;
  const pad =
    spread === 0
      ? Math.max(Math.round(Math.abs(max) * 0.08), 100)
      : Math.max(Math.round(spread * 0.08), 100);
  return [min - pad, max + pad];
}

export function InteractiveChart({
  trendData,
  chartTone,
  resetBrushKey = "",
  onVisibleRangeChange,
}: Props) {
  const uid = useId().replace(/\W/g, "");
  const gradientId = `metric-chart-fill-${uid}`;
  const colors = TONE_COLORS[chartTone];
  const onRangeRef = useRef(onVisibleRangeChange);
  useEffect(() => {
    onRangeRef.current = onVisibleRangeChange;
  }, [onVisibleRangeChange]);

  const data = useMemo(
    () =>
      trendData.map((p) => ({
        label: p.label,
        date: p.date,
        dateMs: parseIsoDateMs(p.date),
        valueCents: p.valueCents,
      })).sort((a, b) => a.dateMs - b.dateMs),
    [trendData],
  );
  const seriesKey = useMemo(
    () => data.map((point) => point.date).join("|"),
    [data],
  );
  const viewKey = `${resetBrushKey}:${seriesKey}`;
  const yDomain = useMemo(
    () => paddedValueDomain(data.map((point) => point.valueCents)),
    [data],
  );
  const dataMinMs = data[0]?.dateMs ?? 0;
  const dataMaxMs = data.at(-1)?.dateMs ?? dataMinMs;
  const timelineStartMs =
    dataMinMs === dataMaxMs ? dataMinMs - DAY_MS / 2 : dataMinMs;
  const timelineEndMs =
    dataMinMs === dataMaxMs ? dataMaxMs + DAY_MS / 2 : dataMaxMs;
  const fullSpanMs = Math.max(DAY_MS, timelineEndMs - timelineStartMs);

  const [viewState, setViewState] = useState<ViewState>(() => ({
    viewKey,
    startMs: timelineStartMs,
    spanMs: fullSpanMs,
  }));
  const rawStartMs =
    viewState.viewKey === viewKey ? viewState.startMs : timelineStartMs;
  const rawSpanMs = viewState.viewKey === viewKey ? viewState.spanMs : fullSpanMs;
  const minSpanMs = Math.min(DAY_MS, fullSpanMs);
  const clampedSpanMs = clamp(rawSpanMs, minSpanMs, fullSpanMs);
  const maxStartMs = timelineEndMs - clampedSpanMs;
  const clampedStartMs = clamp(rawStartMs, timelineStartMs, maxStartMs);
  const visibleEndMs = clampedStartMs + clampedSpanMs;
  const visibleDomain: [number, number] = [clampedStartMs, visibleEndMs];
  const scrollStepMs = Math.max(Math.round(clampedSpanMs / 240), 60_000);
  const scaleStepMs = Math.max(Math.round(fullSpanMs / 240), 60_000);
  const visibleRange = useMemo<ChartVisibleRange | null>(() => {
    if (data.length === 0) return null;
    const startIndex = data.findIndex((point) => point.dateMs >= clampedStartMs);
    const endIndex = data.findLastIndex((point) => point.dateMs <= visibleEndMs);
    return {
      startDate: toIsoDate(clampedStartMs),
      endDate: toIsoDate(visibleEndMs),
      startIndex: startIndex === -1 ? 0 : startIndex,
      endIndex: endIndex === -1 ? data.length - 1 : endIndex,
    };
  }, [data, clampedStartMs, visibleEndMs]);

  useEffect(() => {
    onRangeRef.current?.(visibleRange);
  }, [visibleRange]);

  const handleScaleChange = useCallback(
    (value: number) => {
      const nextSpanMs = clamp(value, minSpanMs, fullSpanMs);
      const currentCenter = clampedStartMs + clampedSpanMs / 2;
      const nextStart = Math.round(currentCenter - nextSpanMs / 2);
      setViewState({
        viewKey,
        spanMs: nextSpanMs,
        startMs: clamp(nextStart, timelineStartMs, timelineEndMs - nextSpanMs),
      });
    },
    [
      clampedSpanMs,
      clampedStartMs,
      fullSpanMs,
      minSpanMs,
      timelineEndMs,
      timelineStartMs,
      viewKey,
    ],
  );

  const handleScrollChange = useCallback(
    (value: number) => {
      setViewState({
        viewKey,
        spanMs: clampedSpanMs,
        startMs: clamp(value, timelineStartMs, maxStartMs),
      });
    },
    [clampedSpanMs, maxStartMs, timelineStartMs, viewKey],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 text-sm text-muted-foreground">
        No trend data for this period.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[280px] w-full flex-col gap-3">
      <div className="min-h-[220px] flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={220}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.fill} stopOpacity={0.45} />
                <stop offset="100%" stopColor={colors.fill} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted-foreground/20"
            />
            <XAxis
              dataKey="dateMs"
              type="number"
              scale="time"
              domain={visibleDomain}
              allowDataOverflow
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={18}
              tickFormatter={(v: number) => formatShortDate(v)}
            />
            <YAxis
              width={88}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatUsd(v)}
              domain={yDomain}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "0.5rem",
                border:
                  "1px solid color-mix(in oklch, var(--border) 60%, transparent)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: "0.75rem",
              }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as
                  | { date?: string; label?: string }
                  | undefined;
                if (row?.date) return row.date;
                return row?.label ? String(row.label) : "";
              }}
              formatter={(value) => [
                formatUsd(
                  typeof value === "number"
                    ? value
                    : Number.parseInt(String(value), 10) || 0,
                ),
                "Amount",
              ]}
            />
            <Area
              type="monotone"
              dataKey="valueCents"
              name="Amount"
              stroke={colors.stroke}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              dot={clampedSpanMs <= DAY_MS * 3 ? { r: 2.5 } : false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid shrink-0 gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center">
        <p className="truncate tabular-nums">{rangeLabel(visibleRange)}</p>
        <div className="grid gap-1.5">
          <label className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.75rem] items-center gap-2">
            <span>Scale</span>
            <input
              type="range"
              min={minSpanMs}
              max={fullSpanMs}
              step={scaleStepMs}
              value={clampedSpanMs}
              disabled={fullSpanMs <= minSpanMs}
              aria-label="Scale visible time span"
              className="h-1.5 w-full accent-foreground disabled:opacity-40"
              onChange={(event) =>
                handleScaleChange(Number(event.currentTarget.value))
              }
            />
            <span className="text-right tabular-nums">
              {formatSpan(clampedSpanMs, fullSpanMs)}
            </span>
          </label>
          <label className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.75rem] items-center gap-2">
            <span>Scroll</span>
            <input
              type="range"
              min={timelineStartMs}
              max={maxStartMs}
              step={scrollStepMs}
              value={clampedStartMs}
              disabled={maxStartMs <= timelineStartMs}
              aria-label="Scroll visible time window"
              className="h-1.5 w-full accent-foreground disabled:opacity-40"
              onChange={(event) =>
                handleScrollChange(Number(event.currentTarget.value))
              }
            />
            <span className="text-right tabular-nums">
              {formatShortDate(clampedStartMs)}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
