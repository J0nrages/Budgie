"use client";

import type { Doc, Id } from "convex/_generated/dataModel";
import { useConvexConnectionState } from "convex/react";
import { Bird, Loader2, Upload } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AccountForm } from "@/components/accounts/account-form";
import { AccountList } from "@/components/accounts/account-list";
import { BudgieChatSheet } from "@/components/budgie/budgie-chat-sheet";
import { SettingsDialog } from "@/components/dashboard/settings-dialog";
import { UploadPanel } from "@/components/imports/upload-panel";
import { AppFooter } from "@/components/layout/app-footer";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { LedgerTable } from "@/components/ledger/ledger-table";
import { TransactionForm } from "@/components/ledger/transaction-form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAccounts } from "@/hooks/use-accounts";
import { useImportFileUpload } from "@/hooks/use-import-file-upload";
import { useImports } from "@/hooks/use-imports";
import { useIsClient } from "@/hooks/use-is-client";
import { useTransactions } from "@/hooks/use-transactions";
import type { AccountLike, TransactionLike } from "@/lib/ledger";
import type { Basis, TransactionType } from "@/types/finance";

export function FinanceApp({
  initialLedgerTab = "transactions",
}: {
  initialLedgerTab?: "transactions" | "accounts" | "imports";
}) {
  const [basis, setBasis] = useState<Basis>("cash");
  const [ledgerTab, setLedgerTab] = useState<
    "transactions" | "accounts" | "imports"
  >(initialLedgerTab);
  const [ledgerAccountId, setLedgerAccountId] = useState<
    Id<"accounts"> | undefined
  >();
  const [accountDialog, setAccountDialog] = useState(false);
  const [txDialog, setTxDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Doc<"accounts"> | null>(
    null,
  );
  const [editingTx, setEditingTx] = useState<Doc<"transactions"> | null>(null);
  const [editingTxInitialType, setEditingTxInitialType] = useState<
    TransactionType | undefined
  >();

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
  const txApi = useTransactions(undefined);
  const { transactions } = txApi;
  const [selectedImportJobId, setSelectedImportJobId] = useState<
    Id<"importJobs"> | undefined
  >(undefined);
  const importsApi = useImports(selectedImportJobId);
  const linkedAccountForUpload = useCallback(
    () => ledgerAccountId,
    [ledgerAccountId],
  );
  const {
    inputRef: statementUploadInputRef,
    busy: statementUploadBusy,
    onFile: onStatementUploadFile,
    openFileDialog: openStatementUploadDialog,
  } = useImportFileUpload(importsApi, linkedAccountForUpload);

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
        postingStatus: t.postingStatus,
      })),
    [transactions],
  );

  if (!convexLive) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="flex items-center gap-2.5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            <Bird
              className="size-8 shrink-0 sm:size-9"
              strokeWidth={1.75}
              aria-hidden
            />
            Budgie
          </h1>
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

        <footer
          className="mt-auto flex justify-end border-t border-border pt-8"
          role="contentinfo"
          aria-label="Theme"
        >
          <ThemeToggle />
        </footer>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-8">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h1 className="flex items-center gap-2.5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            <Bird
              className="size-8 shrink-0 sm:size-9"
              strokeWidth={1.75}
              aria-hidden
            />
            Budgie
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <BudgieChatSheet />
            <SettingsDialog basis={basis} onBasisChange={setBasis} />
          </div>
        </header>

        <SummaryCards
          accounts={accountLikes}
          transactions={txLikes}
          basis={basis}
        />

        <Tabs
          value={ledgerTab}
          className="gap-0"
          onValueChange={(value) =>
            setLedgerTab(value as "transactions" | "accounts" | "imports")
          }
        >
          <div className="flex items-center justify-between border-b pb-2">
            <TabsList variant="line" className="h-auto p-0">
              <TabsTrigger
                value="transactions"
                className="px-4 py-2 text-base data-active:after:bottom-[-9px]"
              >
                Ledger
              </TabsTrigger>
              <TabsTrigger
                value="accounts"
                className="px-4 py-2 text-base data-active:after:bottom-[-9px]"
              >
                Accounts
              </TabsTrigger>
              <TabsTrigger
                value="imports"
                className="px-4 py-2 text-base data-active:after:bottom-[-9px]"
              >
                Imports
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <input
                ref={statementUploadInputRef}
                type="file"
                multiple
                accept=".csv,.pdf,text/csv,application/pdf"
                disabled={statementUploadBusy}
                onChange={onStatementUploadFile}
                className="hidden"
                aria-hidden
                tabIndex={-1}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={statementUploadBusy}
                onClick={openStatementUploadDialog}
                aria-label="Upload file for import"
              >
                <Upload
                  className="size-3.5 shrink-0"
                  aria-hidden
                />
                {statementUploadBusy ? "Uploading…" : "Upload"}
              </Button>
              {ledgerTab === "transactions" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingTx(null);
                    setEditingTxInitialType(undefined);
                    setTxDialog(true);
                  }}
                >
                  Add transaction
                </Button>
              ) : ledgerTab === "accounts" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingAccount(null);
                    setAccountDialog(true);
                  }}
                >
                  Add account
                </Button>
              ) : null}
            </div>
          </div>

          <TabsContent value="transactions">
            <LedgerTable
              accounts={accounts}
              transactions={transactions}
              basis={basis}
              filterAccountId={ledgerAccountId}
              onFilterAccount={setLedgerAccountId}
              onEdit={(tx, initialType) => {
                setEditingTx(tx);
                setEditingTxInitialType(initialType);
                setTxDialog(true);
              }}
              onTypeChange={async (transactionId, type) => {
                await txApi.updateTx({ transactionId, type });
              }}
            />
          </TabsContent>
          <TabsContent value="accounts" className="pt-6">
            <AccountList
              accounts={accounts}
              transactions={txLikes}
              basis={basis}
              onSelectAccount={(a) => {
                setLedgerAccountId(a._id);
                setLedgerTab("transactions");
              }}
              onEditAccount={(a) => {
                setEditingAccount(a);
                setAccountDialog(true);
              }}
            />
          </TabsContent>
          <TabsContent value="imports" className="pt-6">
            <UploadPanel
              jobs={importsApi.jobs}
              effectiveJobId={importsApi.effectiveJobId}
              selectedJobId={selectedImportJobId}
              onSelectJob={setSelectedImportJobId}
              accounts={accounts}
              importsApi={importsApi}
            />
          </TabsContent>
        </Tabs>
      </div>

      <div>
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
            if (!o) {
              setEditingTx(null);
              setEditingTxInitialType(undefined);
            }
          }}
          editing={editingTx}
          initialType={editingTxInitialType}
          accounts={accounts}
          txApi={txApi}
        />
      </div>

      <AppFooter />
    </div>
  );
}
