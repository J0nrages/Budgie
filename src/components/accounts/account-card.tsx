"use client";

import type { Doc } from "convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AccountLike, TransactionLike } from "@/lib/ledger";
import { buildAccountLedger } from "@/lib/ledger";
import { formatUsd } from "@/lib/money";
import { statusBadgeClass } from "@/styles/design-tokens";
import type { Basis } from "@/types/finance";

type Props = {
  account: Doc<"accounts">;
  transactions: TransactionLike[];
  basis: Basis;
  onEdit: () => void;
};

export function AccountCard({ account, transactions, basis, onEdit }: Props) {
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

  const owed =
    account.type === "liability"
      ? formatUsd(Math.abs(balance))
      : formatUsd(balance);

  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/40" onClick={onEdit} role="button" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{account.name}</CardTitle>
          <CardDescription className="font-mono text-xs">
            {account.institution ?? "Personal"} ···
            {account.lastFour ?? "—"}
          </CardDescription>
        </div>
        <Badge
          className={
            account.type === "asset"
              ? statusBadgeClass.asset
              : statusBadgeClass.liability
          }
        >
          {account.type}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-right font-mono text-xl tabular-nums">
          {account.type === "liability" ? owed : formatUsd(balance)}
        </p>
        {account.type === "liability" ? (
          <p className="mt-1 text-right text-xs text-muted-foreground">
            Amount owed (absolute)
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
