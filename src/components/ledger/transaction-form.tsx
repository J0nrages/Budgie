"use client";

import type { Doc } from "convex/_generated/dataModel";
import type { Id } from "convex/_generated/dataModel";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useTransactions } from "@/hooks/use-transactions";
import { parseUsdToCents } from "@/lib/money";
import type { TransactionType } from "@/types/finance";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Doc<"transactions"> | null;
  accounts: Doc<"accounts">[] | undefined;
  txApi: ReturnType<typeof useTransactions>;
};

export function TransactionForm({
  open,
  onOpenChange,
  editing,
  accounts,
  txApi,
}: Props) {
  const { createTx, updateTx, deleteTx } = txApi;
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("0");
  const [primaryAccount, setPrimaryAccount] = useState<string>("");
  const [fromAccount, setFromAccount] = useState<string>("");
  const [toAccount, setToAccount] = useState<string>("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [incurred, setIncurred] = useState("");
  const [cleared, setCleared] = useState(false);
  const [clearedDate, setClearedDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- dialog opens with new editing target */
    if (editing) {
      setType(editing.type);
      setAmount((editing.amountCents / 100).toFixed(2));
      setPrimaryAccount(editing.accountId ?? "");
      setFromAccount(editing.fromAccountId ?? "");
      setToAccount(editing.toAccountId ?? "");
      setDescription(editing.description);
      setCategory(editing.category ?? "");
      setIncurred(editing.incurredDate);
      setCleared(editing.isCleared);
      setClearedDate(editing.clearedDate ?? "");
    } else {
      setType("expense");
      setAmount("0");
      setPrimaryAccount("");
      setFromAccount("");
      setToAccount("");
      setDescription("");
      setCategory("");
      setIncurred(new Date().toISOString().slice(0, 10));
      setCleared(false);
      setClearedDate("");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editing]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const cents = parseUsdToCents(amount);
      if (cents === null || cents <= 0) throw new Error("Invalid amount");

      if (type === "transfer") {
        if (!fromAccount || !toAccount || fromAccount === toAccount) {
          throw new Error("Transfers need two different accounts");
        }
        if (editing) {
          await updateTx({
            transactionId: editing._id,
            type,
            amountCents: cents,
            fromAccountId: fromAccount as Id<"accounts">,
            toAccountId: toAccount as Id<"accounts">,
            accountId: undefined,
            description,
            category,
            incurredDate: incurred,
            isCleared: cleared,
            clearedDate: cleared ? clearedDate : undefined,
          });
        } else {
          await createTx({
            type,
            amountCents: cents,
            fromAccountId: fromAccount as Id<"accounts">,
            toAccountId: toAccount as Id<"accounts">,
            description,
            category,
            incurredDate: incurred,
            isCleared: cleared,
            clearedDate: cleared ? clearedDate : undefined,
          });
        }
      } else {
        if (!primaryAccount) throw new Error("Choose an account");
        if (editing) {
          await updateTx({
            transactionId: editing._id,
            type,
            amountCents: cents,
            accountId: primaryAccount as Id<"accounts">,
            fromAccountId: undefined,
            toAccountId: undefined,
            description,
            category,
            incurredDate: incurred,
            isCleared: cleared,
            clearedDate: cleared ? clearedDate : undefined,
          });
        } else {
          await createTx({
            type,
            amountCents: cents,
            accountId: primaryAccount as Id<"accounts">,
            description,
            category,
            incurredDate: incurred,
            isCleared: cleared,
            clearedDate: cleared ? clearedDate : undefined,
          });
        }
      }
      toast.success("Transaction saved.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!editing) return;
    setBusy(true);
    try {
      await deleteTx({ transactionId: editing._id });
      toast.success("Deleted.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit transaction" : "New transaction"}
          </DialogTitle>
          <DialogDescription>
            Amounts are always positive; type determines direction in the
            ledger.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as TransactionType)}
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="interest">Interest</SelectItem>
                <SelectItem value="fee">Fee</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amt">Amount (USD)</Label>
            <Input
              id="amt"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          {type === "transfer" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>From</Label>
                <Select value={fromAccount} onValueChange={setFromAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts ?? []).map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Select value={toAccount} onValueChange={setToAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts ?? []).map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={primaryAccount} onValueChange={setPrimaryAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat">Category</Label>
            <Input
              id="cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="inc">Incurred date</Label>
              <Input
                id="inc"
                type="date"
                value={incurred}
                onChange={(e) => setIncurred(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2 flex flex-col gap-2">
              <Label>Cleared</Label>
              <Button
                type="button"
                variant={cleared ? "default" : "outline"}
                size="sm"
                className="w-fit"
                onClick={() => setCleared(!cleared)}
              >
                {cleared ? "Yes" : "No"}
              </Button>
            </div>
          </div>
          {cleared ? (
            <div className="space-y-2">
              <Label htmlFor="clr">Cleared date</Label>
              <Input
                id="clr"
                type="date"
                value={clearedDate}
                onChange={(e) => setClearedDate(e.target.value)}
                required
              />
            </div>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <div>
              {editing ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" disabled={busy}>
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the ledger entry permanently.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
