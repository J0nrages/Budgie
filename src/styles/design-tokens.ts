export const statusBadgeClass = {
  asset: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  liability: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  cleared: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  pending: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  needsAccountLink: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  needsReview: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  duplicate: "bg-orange-500/15 text-orange-800 dark:text-orange-400",
  failed: "bg-destructive/15 text-destructive",
  processing: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
} as const;
