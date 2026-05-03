"use client";

import type { Doc } from "convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
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

export function ImportJobStatus({ job }: { job: Doc<"importJobs"> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="font-mono text-sm">
          Job · {job._id.slice(-8)}
        </CardTitle>
        <Badge className={badgeClass(job.status)}>{job.status}</Badge>
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
      </CardContent>
    </Card>
  );
}
