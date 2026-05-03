"use client";

import type { Doc } from "convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { TransactionLike } from "@/lib/ledger";
import type { Basis } from "@/types/finance";
import { AccountCard } from "./account-card";

type Props = {
  accounts: Doc<"accounts">[] | undefined;
  transactions: TransactionLike[];
  basis: Basis;
  onSelectAccount: (account: Doc<"accounts">) => void;
};

export function AccountList({
  accounts,
  transactions,
  basis,
  onSelectAccount,
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((a) => (
        <AccountCard
          key={a._id}
          account={a}
          transactions={transactions}
          basis={basis}
          onEdit={() => onSelectAccount(a)}
        />
      ))}
    </div>
  );
}
