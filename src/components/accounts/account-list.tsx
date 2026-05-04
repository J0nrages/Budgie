"use client";

import type { Doc } from "convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  transactions: TransactionLike[];
  basis: Basis;
  onSelectAccount: (account: Doc<"accounts">) => void;
  onEditAccount?: (account: Doc<"accounts">) => void;
};

export function AccountList({
  accounts,
  transactions,
  basis,
  onSelectAccount,
  onEditAccount,
}: Props) {
  if (accounts === undefined) {
    return (
      <div className="space-y-4">
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Loading accounts</AlertTitle>
          <AlertDescription>
            Fetching account records from Convex.
          </AlertDescription>
        </Alert>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </div>
    );
  }
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No accounts yet. Create one to get started.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Institution</TableHead>
          <TableHead className="text-right">Current balance</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => {
          const like: AccountLike = {
            _id: account._id,
            name: account.name,
            type: account.type,
            initialBalanceCents: account.initialBalanceCents,
          };
          const lines = buildAccountLedger(like, transactions, basis);
          const balance =
            lines.length === 0
              ? account.initialBalanceCents
              : lines[0].runningBalanceCents;

          return (
            <TableRow
              key={account._id}
              className="cursor-pointer"
              tabIndex={0}
              onClick={() => onSelectAccount(account)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectAccount(account);
                }
              }}
            >
              <TableCell>
                <div className="font-medium">{account.name}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {account.lastFour ? `···${account.lastFour}` : "No suffix"}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  className={
                    account.type === "asset"
                      ? statusBadgeClass.asset
                      : statusBadgeClass.liability
                  }
                >
                  {account.type}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {account.institution ?? "Personal"}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatUsd(
                  account.type === "liability" ? Math.abs(balance) : balance,
                )}
              </TableCell>
              <TableCell className="text-right">
                {onEditAccount ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditAccount(account);
                    }}
                  >
                    Edit
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
