"use client";

import { useMutation, useQuery } from "convex/react";
import type { Id } from "convex/_generated/dataModel";
import { api } from "convex/_generated/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AccountLinkPrompt } from "@/components/imports/account-link-prompt";
import { ImportJobStatus } from "@/components/imports/import-job-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAccounts } from "@/hooks/use-accounts";
import { useImports } from "@/hooks/use-imports";
import { formatUsd } from "@/lib/money";
import { statusBadgeClass } from "@/styles/design-tokens";
import { ImportDocumentViewer } from "./import-document-viewer";

type Props = {
  jobId: string;
};

function rowBadgeClass(status: string) {
  switch (status) {
    case "duplicate":
      return statusBadgeClass.duplicate;
    case "error":
      return statusBadgeClass.failed;
    case "accepted":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    default:
      return statusBadgeClass.needsReview;
  }
}

export function ImportReviewWorkspace({ jobId }: Props) {
  const importJobId = jobId as Id<"importJobs">;
  const workspace = useQuery(api.imports.getImportReviewWorkspace, {
    importJobId,
  });
  const applyImportJobReadyRows = useMutation(api.imports.applyImportJobReadyRows);
  const deleteStoredOriginalStatement = useMutation(
    api.statements.deleteStoredOriginalStatement,
  );
  const accountsApi = useAccounts();
  const importsApi = useImports(importJobId);
  const { updateRow, acceptRow, rejectRow } = importsApi;

  const [selectedRowId, setSelectedRowId] = useState<Id<"importRows"> | undefined>(
    undefined,
  );
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [bankTransactionId, setBankTransactionId] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [applyingReady, setApplyingReady] = useState(false);
  const [deletingOriginal, setDeletingOriginal] = useState(false);

  const rows = useMemo(() => workspace?.rows ?? [], [workspace?.rows]);

  const selectedRow = useMemo(
    () => rows.find((row) => row._id === selectedRowId),
    [rows, selectedRowId],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- keep row selection and editor fields in sync when workspace data changes */
  useEffect(() => {
    if (!workspace) return;
    const nextSelected =
      workspace.exceptionRows[0]?._id ?? workspace.readyRows[0]?._id ?? undefined;
    if (!selectedRowId || !rows.some((row) => row._id === selectedRowId)) {
      setSelectedRowId(nextSelected);
    }
  }, [rows, selectedRowId, workspace]);

  useEffect(() => {
    if (!selectedRow) return;
    setDesc(selectedRow.normalizedDescription);
    setAmt((selectedRow.normalizedAmountCents / 100).toFixed(2));
    setDate(selectedRow.normalizedIncurredDate);
    setMerchantName(selectedRow.merchantName ?? "");
    setBankTransactionId(selectedRow.bankTransactionId ?? "");
    setMemo(selectedRow.memo ?? "");
  }, [selectedRow]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (workspace === undefined) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-muted-foreground">
        Loading review workspace…
      </div>
    );
  }

  if (workspace === null || !workspace.job || !workspace.statementFile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Import not found</CardTitle>
            <CardDescription>
              This statement review job is missing or no longer available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/?tab=imports">Back to imports</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statementFile = workspace.statementFile;

  async function saveSelectedRow() {
    if (!selectedRow) return;
    setSaving(true);
    try {
      const dollars = Number.parseFloat(amt);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        throw new Error("Amount must be positive");
      }

      await updateRow({
        importRowId: selectedRow._id,
        normalizedDescription: desc,
        normalizedAmountCents: Math.round(dollars * 100),
        normalizedIncurredDate: date,
        merchantName: merchantName.trim() || undefined,
        bankTransactionId: bankTransactionId.trim() || undefined,
        memo: memo.trim() || undefined,
      });
      toast.success("Row updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" className="-ml-3 px-3 text-sm text-muted-foreground">
            <Link href="/?tab=imports">Back to imports</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Statement review</h1>
          <p className="text-sm text-muted-foreground">
            Resolve exceptions beside the original document and apply any review-ready rows.
          </p>
        </div>
        {workspace.canApplyReadyRows ? (
          <Button
            disabled={applyingReady}
            onClick={async () => {
              setApplyingReady(true);
              try {
                const result = await applyImportJobReadyRows({ importJobId });
                toast.success(
                  result.appliedCount === 1
                    ? "Applied 1 row to the ledger."
                    : `Applied ${result.appliedCount} rows to the ledger.`,
                );
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Apply failed");
              } finally {
                setApplyingReady(false);
              }
            }}
          >
            {applyingReady
              ? "Applying…"
              : `Apply ${workspace.summary.readyCount} ready row${workspace.summary.readyCount === 1 ? "" : "s"}`}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Applied</p>
            <p className="font-mono text-2xl">{workspace.summary.acceptedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Ready</p>
            <p className="font-mono text-2xl">{workspace.summary.readyCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Duplicates</p>
            <p className="font-mono text-2xl">{workspace.summary.duplicateCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Errors</p>
            <p className="font-mono text-2xl">{workspace.summary.errorCount}</p>
          </CardContent>
        </Card>
      </div>

      <ImportJobStatus job={workspace.job} />

      {workspace.job.status === "needsAccountLink" ? (
        <AccountLinkPrompt
          key={workspace.job._id}
          job={workspace.job}
          accounts={accountsApi.accounts}
          importsApi={importsApi}
        />
      ) : null}

      {(workspace.job.parserWarnings?.length || workspace.job.accountMetadataWarnings?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>Warnings</CardTitle>
            <CardDescription>
              These warnings are visible but do not block applying review-ready rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(workspace.job.parserWarnings ?? []).map((warning: string) => (
              <p key={warning} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                {warning}
              </p>
            ))}
            {(workspace.job.accountMetadataWarnings ?? []).map((warning: string) => (
              <p key={warning} className="rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2">
                {warning}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Original file retention</CardTitle>
            <CardDescription>
              Original uploads are stored in Convex File Storage so review can span sessions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Retention policy</p>
                <p className="font-medium">{statementFile.originalRetentionPolicy}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Storage status</p>
                <p className="font-medium">{statementFile.originalStorageStatus}</p>
              </div>
            </div>
            {statementFile.originalStorageDeletedAt ? (
              <p className="text-muted-foreground">
                Deleted {new Date(statementFile.originalStorageDeletedAt).toLocaleString()}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {workspace.fileUrl ? (
                <Button asChild variant="secondary">
                  <a href={workspace.fileUrl} target="_blank" rel="noreferrer">
                    Open original file
                  </a>
                </Button>
              ) : null}
              {statementFile.originalStorageStatus === "available" ? (
                <Button
                  variant="outline"
                  disabled={deletingOriginal}
                  onClick={async () => {
                    setDeletingOriginal(true);
                    try {
                      await deleteStoredOriginalStatement({
                        statementFileId: statementFile._id,
                      });
                      toast.success("Original file removed from storage.");
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Could not delete original file",
                      );
                    } finally {
                      setDeletingOriginal(false);
                    }
                  }}
                >
                  {deletingOriginal ? "Deleting…" : "Delete original file"}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account review</CardTitle>
            <CardDescription>
              Compare the account tied to this import with the metadata extracted from the statement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 p-3">
                <p className="font-medium">Current account</p>
                {workspace.account ? (
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <p>{workspace.account.name}</p>
                    <p>
                      {workspace.account.type} / {workspace.account.subtype}
                    </p>
                    <p>
                      {workspace.account.issuer ?? workspace.account.institution ?? "Unknown institution"}
                      {workspace.account.lastFour ? ` · ${workspace.account.lastFour}` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-muted-foreground">No account linked yet.</p>
                )}
              </div>
              <div className="rounded-lg border border-border/70 p-3">
                <p className="font-medium">Statement metadata</p>
                {workspace.job.accountSuggestion ? (
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <p>{workspace.job.accountSuggestion.issuer}</p>
                    <p>
                      {workspace.job.accountSuggestion.institution ?? "Unknown institution"}
                    </p>
                    <p>Last four {workspace.job.accountSuggestion.lastFour}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-muted-foreground">No account metadata was parsed.</p>
                )}
              </div>
            </div>
            {workspace.job.status === "needsAccountLink" ? (
              <p className="text-muted-foreground">
                A new account can be created from the parsed statement here after confirmation.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <ImportDocumentViewer
          fileUrl={workspace.fileUrl}
          fileName={statementFile.fileName}
          contentType={statementFile.contentType}
          sourceHint={selectedRow?.rawSummary}
        />

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review queue</CardTitle>
              <CardDescription>
                Exceptions stay here until you edit, apply, or reject them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.exceptionRows.length > 0 ? (
                <ScrollArea className="h-[260px] pr-4">
                  <div className="space-y-2">
                    {workspace.exceptionRows.map((row: (typeof workspace.rows)[number]) => (
                      <button
                        key={row._id}
                        type="button"
                        onClick={() => setSelectedRowId(row._id)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          row._id === selectedRowId
                            ? "border-primary bg-primary/5"
                            : "border-border/70 hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={rowBadgeClass(row.status)}>{row.status}</Badge>
                          {row.sourceReference ? (
                            <span className="text-xs text-muted-foreground">
                              {row.sourceReference}
                              {row.sourcePage ? ` · page ${row.sourcePage}` : ""}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 font-medium">{row.normalizedDescription}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {row.rawSummary}
                        </p>
                        <p className="mt-2 font-mono text-sm">{formatUsd(row.normalizedAmountCents)}</p>
                        {row.redactedError ? (
                          <p className="mt-2 text-sm text-destructive">{row.redactedError}</p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              ) : workspace.summary.readyCount > 0 ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                  <p className="font-medium">No blocking exceptions</p>
                  <p className="mt-1 text-muted-foreground">
                    This statement parsed cleanly. Apply the ready rows when you are satisfied.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                  <p className="font-medium">Review complete</p>
                  <p className="mt-1 text-muted-foreground">
                    There are no remaining exceptions or unapplied ready rows.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selected row</CardTitle>
              <CardDescription>
                Correct the normalized fields, then apply or reject the row.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedRow ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={rowBadgeClass(selectedRow.status)}>
                      {selectedRow.status}
                    </Badge>
                    {selectedRow.sourceReference ? (
                      <span className="text-sm text-muted-foreground">
                        {selectedRow.sourceReference}
                        {selectedRow.sourcePage ? ` · page ${selectedRow.sourcePage}` : ""}
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
                    <p className="font-medium">Source snippet</p>
                    <p className="mt-1 text-muted-foreground">{selectedRow.rawSummary}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border/70 p-3 text-sm">
                      <p className="font-medium">Parsed now</p>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        <p>{selectedRow.normalizedDescription}</p>
                        <p>{selectedRow.normalizedIncurredDate}</p>
                        <p>{formatUsd(selectedRow.normalizedAmountCents)}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/70 p-3 text-sm">
                      <p className="font-medium">Will import as</p>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        <p>{desc}</p>
                        <p>{date}</p>
                        <p>{amt ? `$${amt}` : "—"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input value={desc} onChange={(event) => setDesc(event.target.value)} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Amount (USD)</Label>
                      <Input value={amt} onChange={(event) => setAmt(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input value={date} onChange={(event) => setDate(event.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Merchant</Label>
                      <Input
                        value={merchantName}
                        onChange={(event) => setMerchantName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bank ID</Label>
                      <Input
                        value={bankTransactionId}
                        onChange={(event) => setBankTransactionId(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Memo</Label>
                    <Input value={memo} onChange={(event) => setMemo(event.target.value)} />
                  </div>
                  {selectedRow.redactedError ? (
                    <p className="text-sm text-destructive">{selectedRow.redactedError}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={saving} onClick={saveSelectedRow}>
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await acceptRow({
                            importRowId: selectedRow._id,
                            forceAcceptDuplicate: selectedRow.status === "duplicate",
                          });
                          toast.success("Row applied to the ledger.");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Apply failed");
                        }
                      }}
                    >
                      {selectedRow.status === "duplicate" ? "Apply anyway" : "Apply row"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await rejectRow({ importRowId: selectedRow._id });
                          toast.success("Row rejected.");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Reject failed");
                        }
                      }}
                    >
                      Reject row
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select an exception or review-ready row to inspect it here.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
