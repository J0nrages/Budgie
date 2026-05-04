"use client";

import type { Doc, Id } from "convex/_generated/dataModel";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeDollarSign,
  CirclePercent,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { compareIsoDates } from "@/lib/dates";
import {
  buildAccountLedger,
  buildAccountLedgerProjected,
  transactionBasisDate,
  transactionProjectedBasisDate,
  type AccountLike,
  type TransactionLike,
} from "@/lib/ledger";
import { formatUsd, parseUsdToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { statusBadgeClass } from "@/styles/design-tokens";
import type { Basis, TransactionType } from "@/types/finance";

const ALL_ACCOUNTS_VALUE = "__all__";

const TRANSACTION_TYPES: TransactionType[] = [
  "income",
  "expense",
  "transfer",
  "interest",
  "fee",
  "payment",
];

const transactionTypeMeta = {
  income: {
    label: "Income",
    Icon: ArrowDownLeft,
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  expense: {
    label: "Expense",
    Icon: ArrowUpRight,
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
  transfer: {
    label: "Transfer",
    Icon: ArrowLeftRight,
    className: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  },
  interest: {
    label: "Interest",
    Icon: CirclePercent,
    className: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  },
  fee: {
    label: "Fee",
    Icon: ReceiptText,
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  },
  payment: {
    label: "Payment",
    Icon: BadgeDollarSign,
    className: "bg-blue-500/15 text-blue-800 dark:text-blue-300",
  },
} satisfies Record<
  TransactionType,
  { label: string; Icon: LucideIcon; className: string }
>;

function TransactionTypePill({
  type,
  className,
}: {
  type: TransactionType;
  className?: string;
}) {
  const { Icon, label, className: colorClassName } = transactionTypeMeta[type];
  return (
    <span
      className={cn(
        "inline-flex h-6 w-24 items-center justify-start gap-1.5 rounded-full px-2 text-xs font-medium",
        colorClassName,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

function requiresAccountReroute(
  currentType: TransactionType,
  nextType: TransactionType,
) {
  return (
    currentType !== nextType &&
    (currentType === "transfer" || nextType === "transfer")
  );
}

function signedAmountForDisplay(tx: TransactionLike): number {
  switch (tx.type) {
    case "expense":
    case "fee":
    case "interest":
      return -tx.amountCents;
    case "income":
    case "payment":
      return tx.amountCents;
    case "transfer":
      return -tx.amountCents;
    default:
      return tx.amountCents;
  }
}

function sortDateDesc(
  a: TransactionLike,
  b: TransactionLike,
  basis: Basis,
  pickDate: (tx: TransactionLike, basis: Basis) => string | null,
): number {
  const da = pickDate(a, basis);
  const db = pickDate(b, basis);
  if (!da || !db) return 0;
  const c = compareIsoDates(da, db);
  if (c !== 0) return -c;
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  return b._id.localeCompare(a._id);
}

type Props = {
  accounts: Doc<"accounts">[] | undefined;
  transactions: Doc<"transactions">[] | undefined;
  basis: Basis;
  filterAccountId: Id<"accounts"> | undefined;
  onFilterAccount: (id: Id<"accounts"> | undefined) => void;
  onEdit: (tx: Doc<"transactions">, initialType?: TransactionType) => void;
  onTypeChange: (
    transactionId: Id<"transactions">,
    type: TransactionType,
  ) => Promise<void>;
};

export function LedgerTable({
  accounts,
  transactions,
  basis,
  filterAccountId,
  onFilterAccount,
  onEdit,
  onTypeChange,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [updatingTypeId, setUpdatingTypeId] =
    useState<Id<"transactions"> | null>(null);
  const [useProjectedCash, setUseProjectedCash] = useState(false);

  const useProjectedEffective =
    useProjectedCash && basis === "cash" && Boolean(filterAccountId);

  const basisPicker = useProjectedEffective
    ? transactionProjectedBasisDate
    : transactionBasisDate;

  const txs: TransactionLike[] = useMemo(
    () =>
      (transactions ?? []).map((t) => ({
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
        postingStatus: t.postingStatus,
      })),
    [transactions],
  );

  const accountById = useMemo(() => {
    const m = new Map<string, Doc<"accounts">>();
    for (const a of accounts ?? []) {
      m.set(a._id, a);
    }
    return m;
  }, [accounts]);

  const transactionById = useMemo(() => {
    const m = new Map<string, Doc<"transactions">>();
    for (const tx of transactions ?? []) {
      m.set(tx._id, tx);
    }
    return m;
  }, [transactions]);

  const formatAccountsColumn = (tx: TransactionLike): string => {
    if (tx.type === "transfer") {
      const from = tx.fromAccountId
        ? accountById.get(tx.fromAccountId)?.name ?? "Unknown"
        : "—";
      const to = tx.toAccountId
        ? accountById.get(tx.toAccountId)?.name ?? "Unknown"
        : "—";
      return `${from} → ${to}`;
    }
    if (tx.accountId) {
      return accountById.get(tx.accountId)?.name ?? "Unknown";
    }
    return "—";
  };

  const filteredTxs = useMemo(() => {
    const minCents = parseUsdToCents(amountMin);
    const maxCents = parseUsdToCents(amountMax);

    return txs.filter((tx) => {
      const basisDate = basisPicker(tx, basis);
      if (basisDate === null) return false;

      if (typeFilter !== "all" && tx.type !== typeFilter) return false;

      if (dateFrom.length > 0 && compareIsoDates(basisDate, dateFrom) < 0) {
        return false;
      }
      if (dateTo.length > 0 && compareIsoDates(basisDate, dateTo) > 0) {
        return false;
      }

      const absAmt = Math.abs(tx.amountCents);
      if (minCents !== null && absAmt < minCents) return false;
      if (maxCents !== null && absAmt > maxCents) return false;

      return true;
    });
  }, [txs, basis, basisPicker, typeFilter, dateFrom, dateTo, amountMin, amountMax]);

  const acc =
    filterAccountId && accounts?.find((a) => a._id === filterAccountId);

  const lines = useMemo(() => {
    if (!acc) return undefined;
    const accountLike = {
      _id: acc._id,
      name: acc.name,
      type: acc.type,
      initialBalanceCents: acc.initialBalanceCents,
    } satisfies AccountLike;
    if (useProjectedEffective) {
      return buildAccountLedgerProjected(accountLike, filteredTxs, basis);
    }
    return buildAccountLedger(accountLike, filteredTxs, basis);
  }, [acc, filteredTxs, basis, useProjectedEffective]);

  const globalRows = useMemo(() => {
    return [...filteredTxs].sort((a, b) => sortDateDesc(a, b, basis, basisPicker));
  }, [filteredTxs, basis, basisPicker]);

  const clearExtraFilters = () => {
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
  };

  const handleTypeChange = async (
    tx: Doc<"transactions">,
    nextType: TransactionType,
  ) => {
    if (tx.type === nextType) return;
    if (requiresAccountReroute(tx.type, nextType)) {
      onEdit(tx, nextType);
      return;
    }

    setUpdatingTypeId(tx._id);
    try {
      await onTypeChange(tx._id, nextType);
      toast.success("Transaction type updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Type update failed");
    } finally {
      setUpdatingTypeId(null);
    }
  };

  const renderTypeSelect = (tx: Doc<"transactions">) => (
    <Select
      value={tx.type}
      disabled={updatingTypeId === tx._id}
      onValueChange={(value) => handleTypeChange(tx, value as TransactionType)}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Change transaction type from ${transactionTypeMeta[tx.type].label}`}
        className="h-7 border-transparent bg-transparent p-0 shadow-none hover:bg-transparent focus:ring-0 focus-visible:ring-2 [&>svg]:hidden"
      >
        <SelectValue>
          <TransactionTypePill type={tx.type} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {TRANSACTION_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            <TransactionTypePill type={type} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const hasAnyTransactionsInBasis = txs.some(
    (tx) => basisPicker(tx, basis) !== null,
  );

  const emptyAfterFilters =
    hasAnyTransactionsInBasis && filteredTxs.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 border-b py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid gap-1.5">
              <Select
                value={filterAccountId ?? ALL_ACCOUNTS_VALUE}
                onValueChange={(v) =>
                  onFilterAccount(
                    v === ALL_ACCOUNTS_VALUE ? undefined : (v as Id<"accounts">),
                  )
                }
              >
                <SelectTrigger id="ledger-account" className="w-[180px] bg-muted/50 shadow-none focus:ring-0">
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ACCOUNTS_VALUE}>All accounts</SelectItem>
                  {(accounts ?? []).map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Select
                value={typeFilter}
                onValueChange={(v) =>
                  setTypeFilter(v as "all" | TransactionType)
                }
              >
                <SelectTrigger id="ledger-type" className="w-[140px] bg-muted/50 shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {basis === "cash" && filterAccountId ? (
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="ledger-projected"
                  checked={useProjectedCash}
                  onCheckedChange={(c) => setUseProjectedCash(c === true)}
                />
                <Label htmlFor="ledger-projected" className="text-xs font-normal">
                  Projected (include uncleared)
                </Label>
              </div>
            ) : null}
          </div>

          <div className="hidden h-8 w-px bg-border md:block" />

          <div className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 items-center text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
              From
            </span>
            <Input
              id="ledger-from"
              type="date"
              className="w-[150px] bg-muted/50 text-xs shadow-none"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="flex h-8 items-center text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
              To
            </span>
            <Input
              id="ledger-to"
              type="date"
              className="w-[150px] bg-muted/50 text-xs shadow-none"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div className="hidden h-8 w-px bg-border md:block" />

          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                $
              </span>
              <Input
                id="ledger-amt-min"
                inputMode="decimal"
                placeholder="Min"
                className="w-20 bg-muted/50 pl-6 text-xs shadow-none"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
              />
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                $
              </span>
              <Input
                id="ledger-amt-max"
                inputMode="decimal"
                placeholder="Max"
                className="w-20 bg-muted/50 pl-6 text-xs shadow-none"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={clearExtraFilters}
          >
            Clear
          </Button>
        </div>

      <div className="py-4">
        {filterAccountId && !acc ? (
          <p className="text-sm text-muted-foreground">
            That account is no longer available. Choose another account or “All
            accounts”.
          </p>
        ) : !hasAnyTransactionsInBasis ? (
          <p className="text-sm text-muted-foreground">
            No transactions for this basis yet.
          </p>
        ) : emptyAfterFilters ? (
          <p className="text-sm text-muted-foreground">
            No transactions match your filters.
          </p>
        ) : filterAccountId && acc && lines ? (
          lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity on this account for the filtered set.
            </p>
          ) : (
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Cleared</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow
                  key={`${l.transactionId}-${l.leg}`}
                  className="cursor-pointer"
                  onClick={() => {
                    const hit = transactionById.get(l.transactionId);
                    if (hit) onEdit(hit);
                  }}
                >
                  <TableCell className="font-mono text-xs">{l.sortDate}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {l.description}
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">
                    {transactionById.get(l.transactionId)?.merchantName ?? "—"}
                  </TableCell>
                  <TableCell
                    className="text-xs"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {(() => {
                      const tx = transactionById.get(l.transactionId);
                      return tx ? (
                        renderTypeSelect(tx)
                      ) : (
                        <TransactionTypePill type={l.type} />
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatUsd(l.deltaCents)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatUsd(l.runningBalanceCents)}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const tx = transactionById.get(l.transactionId);
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
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Cleared</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {globalRows.map((tx) => {
              const sortDate = basisPicker(tx, basis);
              const raw = transactionById.get(tx._id);
              return (
                <TableRow
                  key={tx._id}
                  className="cursor-pointer"
                  onClick={() => {
                    if (raw) onEdit(raw);
                  }}
                >
                  <TableCell className="font-mono text-xs">
                    {sortDate ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {tx.description}
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">
                    {raw?.merchantName ?? "—"}
                  </TableCell>
                  <TableCell
                    className="text-xs"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {raw ? (
                      renderTypeSelect(raw)
                    ) : (
                      <TransactionTypePill type={tx.type} />
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs">
                    {formatAccountsColumn(tx)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatUsd(signedAmountForDisplay(tx))}
                  </TableCell>
                  <TableCell>
                    {tx.isCleared ? (
                      <Badge className={statusBadgeClass.cleared}>Cleared</Badge>
                    ) : (
                      <Badge className={statusBadgeClass.pending}>Pending</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
      </div>
    </div>
  );
}
