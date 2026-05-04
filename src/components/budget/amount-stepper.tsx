"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { formatUsd, parseUsdToCents } from "@/lib/money";

type Variant = "hero" | "row";

type Props = {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  variant?: Variant;
  showSlider?: boolean;
};

/**
 * Amount stepper modeled on Rocket Money: big amount on top, slider with +/-
 * round buttons. Two variants:
 *  - `hero`  — large heading amount, full slider underneath (used at top of step).
 *  - `row`   — compact inline stepper for list rows.
 */
export function AmountStepper({
  valueCents,
  onChangeCents,
  min = 0,
  max = 2_000_000,
  step = 5_00,
  ariaLabel,
  variant = "hero",
  showSlider = true,
}: Props) {
  const [draft, setDraft] = useState(toDraft(valueCents));
  const [lastSyncedCents, setLastSyncedCents] = useState(valueCents);
  // React 19 pattern: sync derived state with prop changes during render
  // instead of useEffect, avoiding the cascading-render warning.
  if (valueCents !== lastSyncedCents) {
    setLastSyncedCents(valueCents);
    setDraft(toDraft(valueCents));
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const commitDraft = () => {
    const parsed = parseUsdToCents(draft);
    if (parsed === null) {
      setDraft(toDraft(valueCents));
      return;
    }
    onChangeCents(clamp(parsed));
  };

  const bump = (delta: number) => {
    onChangeCents(clamp(valueCents + delta));
  };

  if (variant === "row") {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Decrease"
          onClick={() => bump(-step)}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-muted-foreground">
            $
          </span>
          <input
            inputMode="decimal"
            aria-label={ariaLabel ?? "Amount"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
            }}
            className="h-8 w-28 rounded-md border border-input bg-background pl-5 pr-2 text-right tabular-nums text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Increase"
          onClick={() => bump(step)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        <div
          className={cn(
            "font-semibold tabular-nums text-foreground",
            "text-4xl sm:text-5xl",
          )}
        >
          {formatUsd(valueCents)}
        </div>
      </div>

      <div className="flex w-full max-w-md items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 rounded-full"
          aria-label="Decrease"
          onClick={() => bump(-step)}
        >
          <Minus className="h-4 w-4" />
        </Button>

        {showSlider ? (
          <Slider
            aria-label={ariaLabel ?? "Amount"}
            value={[clamp(valueCents)]}
            min={min}
            max={max}
            step={step}
            onValueChange={(v) => {
              const next = clamp(Number(v?.[0] ?? 0));
              onChangeCents(next);
            }}
            className="flex-1"
          />
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 rounded-full"
          aria-label="Increase"
          onClick={() => bump(step)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex w-full max-w-md justify-between text-xs text-muted-foreground">
        <span>{formatUsd(min)}</span>
        <span>{formatUsd(max)}</span>
      </div>
    </div>
  );
}

function toDraft(cents: number): string {
  return (cents / 100).toFixed(2);
}
