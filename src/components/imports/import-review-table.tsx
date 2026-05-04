"use client";

import type { Doc, Id } from "convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { useImports } from "@/hooks/use-imports";
import { formatUsd } from "@/lib/money";
import { statusBadgeClass } from "@/styles/design-tokens";
import type { PostingStatus } from "@/types/finance";

type Props = {
  jobId: Id<"importJobs"> | undefined;
  job?: Doc<"importJobs"> | null;
  rows: Doc<"importRows">[] | undefined;
  importsApi: ReturnType<typeof useImports>;
};

function reconBadgeClass(status: NonNullable<Doc<"importJobs">["reconciliationStatus"]>) {
  switch (status) {
    case "matched":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "mismatch":
      return "bg-destructive/15 text-destructive";
    case "provisional":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function ImportReviewTable({ jobId, job, rows, importsApi }: Props) {
  const { updateRow, acceptRow, rejectRow, rejectAll } = importsApi;
  const [edit, setEdit] = useState<Doc<"importRows"> | null>(null);
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [normalizedMerchantName, setNormalizedMerchantName] = useState("");
  const [bankTransactionId, setBankTransactionId] = useState("");
  const [memo, setMemo] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [postedDate, setPostedDate] = useState("");
  const [postingStatus, setPostingStatus] = useState<PostingStatus | "">("");

  if (!jobId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an import job to review rows.
      </p>
    );
  }
  if (rows === undefined) {
    return <p className="text-sm text-muted-foreground">Loading rows…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No rows yet — the workflow may still be running.
      </p>
    );
  }

  function openEdit(row: Doc<"importRows">) {
    setEdit(row);
    setDesc(row.normalizedDescription);
    setAmt((row.normalizedAmountCents / 100).toFixed(2));
    setDate(row.normalizedIncurredDate);
    setMerchantName(row.merchantName ?? "");
    setNormalizedMerchantName(row.normalizedMerchantName ?? "");
    setBankTransactionId(row.bankTransactionId ?? "");
    setMemo(row.memo ?? "");
    setTransactionDate(row.normalizedTransactionDate ?? "");
    setPostedDate(row.normalizedPostedDate ?? "");
    setPostingStatus(row.postingStatus ?? "");
  }

  async function saveEdit() {
    if (!edit) return;
    try {
      const dollars = Number.parseFloat(amt);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        throw new Error("Amount must be positive");
      }
      const cents = Math.round(dollars * 100);
      await updateRow({
        importRowId: edit._id,
        normalizedDescription: desc,
        normalizedAmountCents: cents,
        normalizedIncurredDate: date,
        merchantName: merchantName.trim() || undefined,
        normalizedMerchantName: normalizedMerchantName.trim() || undefined,
        bankTransactionId: bankTransactionId.trim() || undefined,
        memo: memo.trim() || undefined,
        normalizedTransactionDate: transactionDate.trim() || undefined,
        normalizedPostedDate: postedDate.trim() || undefined,
        postingStatus: postingStatus || undefined,
      });
      toast.success("Row updated.");
      setEdit(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  function rowBadge(status: Doc<"importRows">["status"]) {
    switch (status) {
      case "duplicate":
        return statusBadgeClass.duplicate;
      case "needsReview":
        return statusBadgeClass.needsReview;
      case "error":
        return statusBadgeClass.failed;
      default:
        return "bg-muted text-muted-foreground";
    }
  }

  return (
    <>
      {job?.reconciliationStatus ? (
        <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Reconciliation</span>
            <Badge className={reconBadgeClass(job.reconciliationStatus)}>
              {job.reconciliationStatus}
            </Badge>
          </div>
          {job.provisionalReason ? (
            <p className="mt-1 text-xs text-muted-foreground">{job.provisionalReason}</p>
          ) : null}
          {job.reconciliationDetail ? (
            <p className="mt-1 text-xs text-destructive/90">{job.reconciliationDetail}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              Reject all open rows
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject all open rows?</AlertDialogTitle>
              <AlertDialogDescription>
                This rejects every row that is not already accepted for this job.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await rejectAll({ importJobId: jobId });
                  toast.success("Rows rejected.");
                }}
              >
                Reject all
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <ScrollArea className="h-[480px] rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]">#</TableHead>
              <TableHead className="min-w-[88px]">Date</TableHead>
              <TableHead className="min-w-[100px]">Merchant</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="min-w-[72px]">Bank ID</TableHead>
              <TableHead className="w-[72px]">Post</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[44px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r._id}>
                <TableCell className="font-mono text-xs">{r.rowIndex}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.normalizedIncurredDate}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">
                  {r.merchantName ?? r.normalizedMerchantName ?? "—"}
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-xs">
                  {r.normalizedDescription}
                </TableCell>
                <TableCell className="max-w-[88px] truncate font-mono text-[10px] text-muted-foreground">
                  {r.bankTransactionId ?? "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {r.postingStatus ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-xs">
                  {formatUsd(r.normalizedAmountCents)}
                </TableCell>
                <TableCell>
                  <Badge className={rowBadge(r.status)}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        ⋯
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(r)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={
                          r.status === "accepted" || r.status === "rejected"
                        }
                        onClick={async () => {
                          try {
                            await acceptRow({
                              importRowId: r._id,
                              forceAcceptDuplicate: r.status === "duplicate",
                            });
                            toast.success("Accepted into ledger.");
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Accept failed",
                            );
                          }
                        }}
                      >
                        Accept
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={
                          r.status === "accepted" || r.status === "rejected"
                        }
                        onClick={async () => {
                          await rejectRow({ importRowId: r._id });
                          toast.success("Row rejected.");
                        }}
                      >
                        Reject
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent className="flex flex-col gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit import row</SheetTitle>
            <SheetDescription>
              Adjust normalized fields before accepting.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Amount (USD)</Label>
            <Input value={amt} onChange={(e) => setAmt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Incurred date (YYYY-MM-DD)</Label>
            <Input value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Transaction date (optional)</Label>
            <Input
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </div>
          <div className="space-y-2">
            <Label>Posted date (optional)</Label>
            <Input
              value={postedDate}
              onChange={(e) => setPostedDate(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </div>
          <div className="space-y-2">
            <Label>Merchant name</Label>
            <Input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Normalized merchant key</Label>
            <Input
              value={normalizedMerchantName}
              onChange={(e) => setNormalizedMerchantName(e.target.value)}
              placeholder="Lowercase / alias target"
            />
          </div>
          <div className="space-y-2">
            <Label>Bank transaction ID</Label>
            <Input
              value={bankTransactionId}
              onChange={(e) => setBankTransactionId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Memo</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Posting status</Label>
            <Select
              value={postingStatus || "__unset__"}
              onValueChange={(v) =>
                setPostingStatus(
                  v === "__unset__" ? "" : (v as PostingStatus),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Unset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unset__">Unset</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="posted">posted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <SheetFooter>
            <Button type="button" onClick={saveEdit}>
              Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
