"use client";

import type { PaceStatus } from "@/types/budget";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LABELS: Record<PaceStatus, string> = {
  underPace: "Under pace",
  nearPace: "On track",
  overPace: "Over pace",
  overBudget: "Over budget",
};

export function PaceBadge({
  status,
  className,
}: {
  status: PaceStatus;
  className?: string;
}) {
  const variant =
    status === "overBudget"
      ? "destructive"
      : status === "overPace"
        ? "secondary"
        : status === "underPace"
          ? "outline"
          : "default";

  return (
    <Badge variant={variant} className={cn("capitalize", className)}>
      {LABELS[status]}
    </Badge>
  );
}
