"use client";

import type { Doc, Id } from "convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useImports } from "@/hooks/use-imports";
import { AccountLinkPrompt } from "./account-link-prompt";
import { ImportJobStatus } from "./import-job-status";
import { ImportReviewTable } from "./import-review-table";
import { MerchantPhaseATools } from "./merchant-phase-a";
import { StatementUpload } from "./statement-upload";

type Props = {
  jobs: Doc<"importJobs">[] | undefined;
  effectiveJobId: Id<"importJobs"> | undefined;
  selectedJobId: Id<"importJobs"> | undefined;
  onSelectJob: (id: Id<"importJobs"> | undefined) => void;
  accounts: Doc<"accounts">[] | undefined;
  importsApi: ReturnType<typeof useImports>;
};

export function UploadPanel({
  jobs,
  effectiveJobId,
  selectedJobId,
  onSelectJob,
  accounts,
  importsApi,
}: Props) {
  const resolvedJobId = selectedJobId ?? effectiveJobId;
  const selectedJob = jobs?.find((j) => j._id === resolvedJobId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imports</CardTitle>
        <CardDescription>
          Upload CSV or PDF statements. Parsed rows stay in review until you accept
          them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <StatementUpload importsApi={importsApi} accounts={accounts} />
        <MerchantPhaseATools importsApi={importsApi} />
        <div className="space-y-2">
          <p className="text-sm font-medium">Recent jobs</p>
          <Select
            value={resolvedJobId ?? "__none__"}
            onValueChange={(v) =>
              onSelectJob(
                v === "__none__" ? undefined : (v as Id<"importJobs">),
              )
            }
          >
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select a job…</SelectItem>
              {(jobs ?? []).map((j) => (
                <SelectItem key={j._id} value={j._id}>
                  {j._id.slice(-8)} · {j.status} · {j.rowCount} rows
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedJob ? <ImportJobStatus job={selectedJob} /> : null}
        {selectedJob ? (
          <AccountLinkPrompt
            key={selectedJob._id}
            job={selectedJob}
            accounts={accounts}
            importsApi={importsApi}
          />
        ) : null}
        <ImportReviewTable
          jobId={resolvedJobId}
          job={selectedJob}
          rows={importsApi.rows}
          importsApi={importsApi}
        />
      </CardContent>
    </Card>
  );
}
