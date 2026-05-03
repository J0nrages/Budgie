"use client";

import { useId } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  value: string;
  hint?: string;
  chartData?: number[];
  chartTone?: "emerald" | "rose" | "sky" | "slate";
  className?: string;
};

type ChartPaths = {
  linePath: string;
  areaPath: string;
};

function buildAreaChartPaths(values: number[]): ChartPaths | null {
  if (values.length === 0) return null;

  const width = 260;
  const height = 120;
  const topPadding = 18;
  const bottomPadding = 22;
  const usableHeight = height - topPadding - bottomPadding;
  const normalizedValues = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const safeRange = range === 0 ? Math.max(Math.abs(max), 1) : range;

  const points = normalizedValues.map((value, index) => {
      const x =
        normalizedValues.length === 1
          ? width
          : (index / (normalizedValues.length - 1)) * width;
      const y =
        range === 0
          ? topPadding + usableHeight * 0.5
          : topPadding + usableHeight - ((value - min) / safeRange) * usableHeight;
      return { x, y };
    });

  const linePath = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }

    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    return `${path} C ${midX.toFixed(2)} ${previous.y.toFixed(2)}, ${midX.toFixed(2)} ${point.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }, "");

  return {
    linePath,
    areaPath: `${linePath} L ${width} ${height} L 0 ${height} Z`,
  };
}

function chartColor(tone: NonNullable<Props["chartTone"]>): string {
  if (tone === "emerald") return "text-emerald-500";
  if (tone === "rose") return "text-rose-500";
  if (tone === "sky") return "text-sky-500";
  return "text-slate-500";
}

export function MetricCard({
  title,
  description,
  value,
  hint,
  chartData = [],
  chartTone = "slate",
  className,
}: Props) {
  const id = useId().replace(/\W/g, "");
  const fillGradientId = `metric-fill-${id}`;
  const strokeGradientId = `metric-stroke-${id}`;
  const chartPaths = buildAreaChartPaths(chartData);

  return (
    <Card className={cn("relative min-h-36 overflow-hidden", className)}>
      {chartPaths ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-90",
            chartColor(chartTone),
          )}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 260 120"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.36" />
                <stop offset="55%" stopColor="currentColor" stopOpacity="0.18" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={strokeGradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                <stop offset="45%" stopColor="currentColor" stopOpacity="0.85" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.65" />
              </linearGradient>
            </defs>
            <path
              d="M 0 36 H 260 M 0 72 H 260"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={chartPaths.areaPath}
              fill={`url(#${fillGradientId})`}
            />
            <path
              d={chartPaths.linePath}
              fill="none"
              stroke={`url(#${strokeGradientId})`}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      ) : null}
      {chartPaths ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-card via-card/95 to-card/20"
          aria-hidden="true"
        />
      ) : null}
      <CardHeader className="relative z-10 max-w-[72%] pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="relative z-10 max-w-[74%]">
        <p className="font-mono text-2xl tabular-nums tracking-tight">
          {value}
        </p>
        {hint ? (
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
