"use client";

import type { Doc } from "convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { parseUsdToCents } from "@/lib/money";
import type { useAccounts } from "@/hooks/use-accounts";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Doc<"accounts"> | null;
  accountsApi: ReturnType<typeof useAccounts>;
};

export function AccountForm({
  open,
  onOpenChange,
  editing,
  accountsApi,
}: Props) {
  const { createAccount, updateAccount, deleteAccount } = accountsApi;
  const [name, setName] = useState("");
  const [type, setType] = useState<"asset" | "liability">("asset");
  const [subtype, setSubtype] = useState<
    "checking" | "savings" | "creditCard" | "loan" | "cash" | "other"
  >("checking");
  const [institution, setInstitution] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [balance, setBalance] = useState("0");
  const [creditLimit, setCreditLimit] = useState("");
  const [aprPercent, setAprPercent] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const [paymentDueDay, setPaymentDueDay] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- dialog opens with new editing target */
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setSubtype(editing.subtype);
      setInstitution(editing.institution ?? "");
      setLastFour(editing.lastFour ?? "");
      setBalance((editing.initialBalanceCents / 100).toFixed(2));
      setCreditLimit(
        editing.creditLimitCents != null
          ? (editing.creditLimitCents / 100).toFixed(2)
          : "",
      );
      setAprPercent(
        editing.aprBps != null ? (editing.aprBps / 100).toFixed(2) : "",
      );
      setStatementDay(
        editing.statementDay != null ? String(editing.statementDay) : "",
      );
      setPaymentDueDay(
        editing.paymentDueDay != null ? String(editing.paymentDueDay) : "",
      );
    } else {
      setName("");
      setType("asset");
      setSubtype("checking");
      setInstitution("");
      setLastFour("");
      setBalance("0");
      setCreditLimit("");
      setAprPercent("");
      setStatementDay("");
      setPaymentDueDay("");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editing]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cents = parseUsdToCents(balance);
      if (cents === null) throw new Error("Invalid opening balance");
      const creditLimitCents = creditLimit.trim()
        ? parseUsdToCents(creditLimit)
        : undefined;
      if (creditLimit.trim() && creditLimitCents === null) {
        throw new Error("Invalid credit limit");
      }
      const aprBps =
        aprPercent.trim().length > 0
          ? Math.round(Number.parseFloat(aprPercent) * 100)
          : undefined;
      if (
        aprPercent.trim().length > 0 &&
        (!Number.isFinite(aprBps) || aprBps === undefined || aprBps < 0)
      ) {
        throw new Error("Invalid APR");
      }

      const sd = statementDay.trim()
        ? Number.parseInt(statementDay, 10)
        : undefined;
      const pd = paymentDueDay.trim()
        ? Number.parseInt(paymentDueDay, 10)
        : undefined;

      if (editing) {
        await updateAccount({
          accountId: editing._id,
          name,
          institution,
          lastFour,
          initialBalanceCents: cents,
          creditLimitCents: creditLimitCents ?? undefined,
          aprBps,
          statementDay: sd,
          paymentDueDay: pd,
        });
      } else {
        await createAccount({
          name,
          type,
          subtype,
          institution,
          lastFour,
          initialBalanceCents: cents,
          creditLimitCents: creditLimitCents ?? undefined,
          aprBps,
          statementDay: sd,
          paymentDueDay: pd,
          lenderProfile:
            subtype === "creditCard"
              ? {
                  aprBps,
                  statementDay: sd,
                  paymentDueDay: pd,
                  interestMethod: "averageDailyBalance",
                }
              : undefined,
        });
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Unable to save account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>
            Liabilities use negative balances for amounts owed. Assets use
            positive balances.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="acc-name">Name</Label>
            <Input
              id="acc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          {!editing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={type}
                    onValueChange={(v) => setType(v as typeof type)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asset">Asset</SelectItem>
                      <SelectItem value="liability">Liability</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subtype</Label>
                  <Select
                    value={subtype}
                    onValueChange={(v) => setSubtype(v as typeof subtype)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Checking</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                      <SelectItem value="creditCard">Credit card</SelectItem>
                      <SelectItem value="loan">Loan</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="inst">Institution</Label>
              <Input
                id="inst"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="four">Last four</Label>
              <Input
                id="four"
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bal">Opening balance (USD)</Label>
            <Input
              id="bal"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              required
            />
          </div>
          {(!editing && subtype === "creditCard") || editing?.subtype === "creditCard" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="lim">Credit limit</Label>
                <Input
                  id="lim"
                  inputMode="decimal"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apr">APR %</Label>
                <Input
                  id="apr"
                  inputMode="decimal"
                  value={aprPercent}
                  onChange={(e) => setAprPercent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stmt">Statement day</Label>
                <Input
                  id="stmt"
                  inputMode="numeric"
                  value={statementDay}
                  onChange={(e) => setStatementDay(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due">Payment due day</Label>
                <Input
                  id="due"
                  inputMode="numeric"
                  value={paymentDueDay}
                  onChange={(e) => setPaymentDueDay(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-0">
            <div>
              {editing ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={submitting}
                    >
                      Delete account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this account?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You cannot delete an account that still has transactions
                        or imports attached.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await deleteAccount({ accountId: editing._id });
                            onOpenChange(false);
                          } catch (e) {
                            alert(
                              e instanceof Error
                                ? e.message
                                : "Unable to delete account",
                            );
                          }
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
