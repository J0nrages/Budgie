"use client";

import type { Doc, Id } from "convex/_generated/dataModel";
import { useConvexConnectionState } from "convex/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AccountForm } from "@/components/accounts/account-form";
import { AccountList } from "@/components/accounts/account-list";
import { BasisToggle } from "@/components/dashboard/basis-toggle";
import { DemoDataControls } from "@/components/demo-data-controls";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { UploadPanel } from "@/components/imports/upload-panel";
import { LedgerTable } from "@/components/ledger/ledger-table";
import { TransactionForm } from "@/components/ledger/transaction-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAccounts } from "@/hooks/use-accounts";
import { useImports } from "@/hooks/use-imports";
import { useIsClient } from "@/hooks/use-is-client";
import { useTransactions } from "@/hooks/use-transactions";
import type { AccountLike, TransactionLike } from "@/lib/ledger";
import type { Basis } from "@/types/finance";

export function FinanceApp() {
  const [basis, setBasis] = useState<Basis>("cash");
  const [selectedJobId, setSelectedJobId] = useState<
    Id<"importJobs"> | undefined
  >();
  const [ledgerAccountId, setLedgerAccountId] = useState<
    Id<"accounts"> | undefined
  >();
  const [accountDialog, setAccountDialog] = useState(false);
  const [txDialog, setTxDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Doc<"accounts"> | null>(
    null,
  );
  const [editingTx, setEditingTx] = useState<Doc<"transactions"> | null>(null);

  const isClient = useIsClient();
  const convexConnection = useConvexConnectionState();
  const conn = isClient
    ? convexConnection
    : {
        hasEverConnected: false,
        isWebSocketConnected: false,
        connectionRetries: 0,
      };

  const convexLive =
    conn.hasEverConnected && conn.isWebSocketConnected;
  const isFirstConnect = !conn.hasEverConnected;
  const showConvexFatal =
    !isFirstConnect ||
    conn.connectionRetries >= 8;
  const accountsApi = useAccounts();
  const { accounts } = accountsApi;
  const ledgerAccountEffective = ledgerAccountId ?? accounts?.[0]?._id;
  const txApi = useTransactions(undefined);
  const { transactions } = txApi;
  const importsApi = useImports(selectedJobId);

  const accountLikes: AccountLike[] = useMemo(
    () =>
      (accounts ?? []).map((a) => ({
        _id: a._id,
        name: a.name,
        type: a.type,
        initialBalanceCents: a.initialBalanceCents,
      })),
    [accounts],
  );

  const txLikes: TransactionLike[] = useMemo(
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
      })),
    [transactions],
  );

  if (!convexLive) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Budgeter</h1>
            <p className="text-sm text-muted-foreground">
              Local-only finance dashboard — no authentication in v1.
            </p>
          </div>
          <ThemeToggle />
        </header>
        <div
          className={
            showConvexFatal
              ? "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm"
              : "rounded-lg border bg-muted/40 px-4 py-6 text-sm"
          }
        >
          {showConvexFatal ? (
            <>
              <p className="font-medium text-destructive">
                Cannot reach the Convex backend.
              </p>
              <p className="mt-2 text-muted-foreground">
                This app does not run without a live connection. Run{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  bunx convex dev
                </code>{" "}
                and confirm{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  NEXT_PUBLIC_CONVEX_URL
                </code>{" "}
                in{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  .env.local
                </code>
                .
              </p>
            </>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
              <span>Connecting to Convex…</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budgeter</h1>
          <p className="text-sm text-muted-foreground">
            Local-only finance dashboard — no authentication in v1.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          <BasisToggle basis={basis} onBasisChange={setBasis} />
          <DemoDataControls />
          <Button size="sm" onClick={() => {
            setEditingAccount(null);
            setAccountDialog(true);
          }}>
            New account
          </Button>
        </div>
      </header>

      <SummaryCards
        accounts={accountLikes}
        transactions={txLikes}
        basis={basis}
      />

      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="imports">Imports</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="space-y-4 pt-4">
          <AccountList
            accounts={accounts}
            transactions={txLikes}
            basis={basis}
            onSelectAccount={(a) => {
              setEditingAccount(a);
              setAccountDialog(true);
            }}
          />
        </TabsContent>
        <TabsContent value="imports" className="pt-4">
          <UploadPanel
            jobs={importsApi.jobs}
            effectiveJobId={importsApi.effectiveJobId}
            selectedJobId={selectedJobId}
            onSelectJob={setSelectedJobId}
            accounts={accounts}
            importsApi={importsApi}
          />
        </TabsContent>
        <TabsContent value="transactions" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Running ledger</CardTitle>
              <CardDescription>
                Pick an account to view chronological activity for the selected
                accounting basis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LedgerTable
                accounts={accounts}
                transactions={transactions}
                basis={basis}
                filterAccountId={ledgerAccountEffective}
                onFilterAccount={setLedgerAccountId}
                onAdd={() => {
                  setEditingTx(null);
                  setTxDialog(true);
                }}
                onEdit={(tx) => {
                  setEditingTx(tx);
                  setTxDialog(true);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator />

      <AccountForm
        open={accountDialog}
        onOpenChange={(o) => {
          setAccountDialog(o);
          if (!o) setEditingAccount(null);
        }}
        editing={editingAccount}
        accountsApi={accountsApi}
      />

      <TransactionForm
        open={txDialog}
        onOpenChange={(o) => {
          setTxDialog(o);
          if (!o) setEditingTx(null);
        }}
        editing={editingTx}
        accounts={accounts}
        txApi={txApi}
      />
    </div>
  );
}
