import { FinanceApp } from "@/app/finance-app";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialLedgerTab =
    tab === "accounts" || tab === "imports" || tab === "transactions"
      ? tab
      : undefined;

  return <FinanceApp initialLedgerTab={initialLedgerTab} />;
}
