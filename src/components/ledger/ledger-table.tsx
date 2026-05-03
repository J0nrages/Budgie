"use client";

import type { Doc, Id } from "convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AccountLike, TransactionLike } from "@/lib/ledger";
import { buildAccountLedger } from "@/lib/ledger";
import { formatUsd } from "@/lib/money";
import { statusBadgeClass } from "@/styles/design-tokens";
import type { Basis } from "@/types/finance";

type Props = {
  accounts: Doc<"accounts">[] | undefined;
  transactions: Doc<"transactions">[] | undefined;
  basis: Basis;
  filterAccountId: Id<"accounts"> | undefined;
  onFilterAccount: (id: Id<"accounts">) => void;
  onAdd: () => void;
  onEdit: (tx: Doc<"transactions">) => void;
};

export function LedgerTable({
  accounts,
  transactions,
  basis,
  filterAccountId,
  onFilterAccount,
  onAdd,
  onEdit,
}: Props) {
  const txs: TransactionLike[] = (transactions ?? []).map((t) => ({
    _id: t._id,
    type: t.type,
    amountCents: t.amountCents,
    accountId: t.accountId,
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    description: t.description,
    incurredDate: t.incurredDate,
    isCleared: t.isCleared,
    clearedDate: t.clearedDate,
    createdAt: t.createdAt,
  }));

  const acc =
    filterAccountId &&
    accounts?.find((a) => a._id === filterAccountId);

  const lines =
    acc &&
    buildAccountLedger(
      {
        _id: acc._id,
        name: acc.name,
        type: acc.type,
        initialBalanceCents: acc.initialBalanceCents,
      } satisfies AccountLike,
      txs,
      basis,
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filterAccountId ?? ""}
          onValueChange={(v) => onFilterAccount(v as Id<"accounts">)}
        >
          <SelectTrigger className="w-[220px]">
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
        <Button size="sm" onClick={onAdd}>
          Add transaction
        </Button>
      </div>
      {!filterAccountId || !acc ? (
        <p className="text-sm text-muted-foreground">
          Choose an account to see its running ledger for this basis.
        </p>
      ) : lines && lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No transactions for this basis yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Cleared</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines?.map((l) => (
              <TableRow
                key={`${l.transactionId}-${l.leg}`}
                className="cursor-pointer"
                onClick={() => {
                  const hit = transactions?.find((t) => t._id === l.transactionId);
                  if (hit) onEdit(hit);
                }}
              >
                <TableCell className="font-mono text-xs">{l.sortDate}</TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {l.description}
                </TableCell>
                <TableCell className="text-xs">{l.type}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatUsd(l.deltaCents)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatUsd(l.runningBalanceCents)}
                </TableCell>
                <TableCell>
                  {(() => {
                    const tx = transactions?.find(
                      (t) => t._id === l.transactionId,
                    );
                    return tx?.isCleared ? (
                      <Badge className={statusBadgeClass.cleared}>Cleared</Badge>
                    ) : (
                      <Badge className={statusBadgeClass.pending}>Pending</Badge>
                    );
                  })()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
