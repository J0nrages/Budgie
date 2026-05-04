"use client";

import { useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Doc } from "convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeClass } from "@/styles/design-tokens";

function badgeClass(status: Doc<"importJobs">["status"]) {
  switch (status) {
    case "failed":
      return statusBadgeClass.failed;
    case "processing":
    case "queued":
      return statusBadgeClass.processing;
    case "needsAccountLink":
      return statusBadgeClass.needsAccountLink;
    case "needsReview":
      return statusBadgeClass.needsReview;
    default:
      return "bg-muted text-muted-foreground";
  }
}

const RETRYABLE_STATUSES: ReadonlyArray<Doc<"importJobs">["status"]> = [
  "failed",
  "processing",
  "queued",
];

export function ImportJobStatus({ job }: { job: Doc<"importJobs"> }) {
  const retryImportJob = useMutation(api.imports.retryImportJob);
  const [retrying, setRetrying] = useState(false);
  const canRetry = RETRYABLE_STATUSES.includes(job.status);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="font-mono text-sm">
          Job · {job._id.slice(-8)}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge className={badgeClass(job.status)}>{job.status}</Badge>
          {canRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  const result = await retryImportJob({
                    importJobId: job._id,
                  });
                  toast.success(
                    result.clearedRowCount > 0
                      ? `Re-parsing started — cleared ${result.clearedRowCount} prior row${result.clearedRowCount === 1 ? "" : "s"}.`
                      : "Re-parsing started.",
                  );
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Could not retry parsing.",
                  );
                } finally {
                  setRetrying(false);
                }
              }}
            >
              {retrying ? "Retrying…" : "Retry parsing"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">Rows</p>
          <p className="font-mono tabular-nums">{job.rowCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Accepted</p>
          <p className="font-mono tabular-nums">{job.acceptedCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Rejected</p>
          <p className="font-mono tabular-nums">{job.rejectedCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Duplicates</p>
          <p className="font-mono tabular-nums">{job.duplicateCount}</p>
        </div>
        {job.redactedError ? (
          <p className="col-span-full text-xs text-destructive">
            {job.redactedError}
          </p>
        ) : null}
        {job.reconciliationStatus ? (
          <div className="col-span-full space-y-1 border-t pt-2 text-xs">
            <p className="text-muted-foreground">Statement reconciliation</p>
            <p className="flex flex-wrap items-center gap-2">
              <Badge
                className={
                  job.reconciliationStatus === "matched"
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                    : job.reconciliationStatus === "mismatch"
                      ? "bg-destructive/15 text-destructive"
                      : job.reconciliationStatus === "provisional"
                        ? "bg-amber-500/15 text-amber-900 dark:text-amber-200"
                        : "bg-muted text-muted-foreground"
                }
              >
                {job.reconciliationStatus}
              </Badge>
              {job.provisionalReason ? (
                <span className="text-muted-foreground">{job.provisionalReason}</span>
              ) : null}
            </p>
            {job.reconciliationDetail ? (
              <p className="text-muted-foreground">{job.reconciliationDetail}</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
