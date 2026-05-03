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

type Props = {
  jobId: Id<"importJobs"> | undefined;
  rows: Doc<"importRows">[] | undefined;
  importsApi: ReturnType<typeof useImports>;
};

export function ImportReviewTable({ jobId, rows, importsApi }: Props) {
  const { updateRow, acceptRow, rejectRow, rejectAll } = importsApi;
  const [edit, setEdit] = useState<Doc<"importRows"> | null>(null);
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState("");

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
      <ScrollArea className="h-[420px] rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[52px]">#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r._id}>
                <TableCell className="font-mono text-xs">{r.rowIndex}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.normalizedIncurredDate}
                </TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {r.normalizedDescription}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
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
        <SheetContent className="flex flex-col gap-4">
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
            <Label>Date (YYYY-MM-DD)</Label>
            <Input value={date} onChange={(e) => setDate(e.target.value)} />
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
