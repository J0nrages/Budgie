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

type ImportJobDoc = Doc<"importJobs">;

function badgeClass(status: ImportJobDoc["status"]) {
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

const RETRYABLE_STATUSES: ReadonlyArray<ImportJobDoc["status"]> = [
  "failed",
  "processing",
  "queued",
];

function progressStageLabel(stage: ImportJobDoc["progressStage"]): string {
  switch (stage) {
    case "queued":
      return "Queued";
    case "starting":
      return "Starting";
    case "loadingFile":
      return "Loading file";
    case "verifyingHash":
      return "Verifying file";
    case "firecrawlParse":
      return "Firecrawl parse";
    case "choosingParser":
      return "Choosing parser";
    case "normalizingRows":
      return "Normalizing rows";
    case "persistingRows":
      return "Saving rows";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return "Status";
  }
}

function fallbackProgressPercent(status: ImportJobDoc["status"]): number {
  switch (status) {
    case "queued":
      return 0;
    case "processing":
      return 15;
    case "failed":
    case "needsAccountLink":
    case "needsReview":
    case "accepted":
    case "cancelled":
      return 100;
    default:
      return 0;
  }
}

function clampProgressPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function progressMessage(job: ImportJobDoc): string {
  if (job.progressMessage) return job.progressMessage;
  switch (job.status) {
    case "queued":
      return "Waiting for the import workflow to start.";
    case "processing":
      return "Import workflow is running.";
    case "failed":
      return "Parsing failed. Review the error below, then retry when ready.";
    case "needsAccountLink":
      return "Rows are parsed; link an account before review.";
    case "needsReview":
      return "Rows are parsed and ready for review.";
    case "accepted":
      return "Rows have been accepted into the ledger.";
    default:
      return "Import workflow state is up to date.";
  }
}

export function ImportJobStatus({ job }: { job: ImportJobDoc }) {
  const retryImportJob = useMutation(api.imports.retryImportJob);
  const [retrying, setRetrying] = useState(false);
  const canRetry = RETRYABLE_STATUSES.includes(job.status);
  const progressPercent = clampProgressPercent(
    job.progressPercent ?? fallbackProgressPercent(job.status),
  );

  return (
    <Card>
      <CardHeader className="grid gap-3 pb-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <CardTitle className="font-mono text-sm">
          Job · {job._id.slice(-8)}
        </CardTitle>
        <div className="space-y-2 sm:min-w-72">
          <div className="flex items-center gap-2 sm:justify-end">
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
          <div className="rounded-lg border border-border/70 bg-muted/30 p-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">
                {progressStageLabel(job.progressStage)}
              </p>
              <p className="font-mono tabular-nums text-muted-foreground">
                {progressPercent}%
              </p>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-muted-foreground">{progressMessage(job)}</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Updated {new Date(job.updatedAt).toLocaleTimeString()}
            </p>
          </div>
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
