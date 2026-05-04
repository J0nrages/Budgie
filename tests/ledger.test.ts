import { describe, expect, it } from "vitest";
import type { AccountLike, TransactionLike } from "@/lib/ledger";
import {
  buildAccountLedger,
  buildAccountLedgerProjected,
  netWorthCents,
  sumIncomeExpense,
} from "@/lib/ledger";

const checking: AccountLike = {
  _id: "chk",
  name: "Checking",
  type: "asset",
  initialBalanceCents: 500_000,
};

const card: AccountLike = {
  _id: "card",
  name: "Card",
  type: "liability",
  initialBalanceCents: -250_000,
};

const accounts = [checking, card];

describe("ledger", () => {
  const txs: TransactionLike[] = [
    {
      _id: "t1",
      type: "expense",
      amountCents: 50_00,
      accountId: "card",
      description: "Groceries",
      incurredDate: "2025-04-02",
      isCleared: true,
      clearedDate: "2025-04-03",
      createdAt: 1,
    },
    {
      _id: "t2",
      type: "transfer",
      amountCents: 100_00,
      fromAccountId: "chk",
      toAccountId: "card",
      description: "Pay card",
      incurredDate: "2025-04-05",
      isCleared: true,
      clearedDate: "2025-04-06",
      createdAt: 2,
    },
    {
      _id: "t3",
      type: "expense",
      amountCents: 12_00,
      accountId: "card",
      description: "Pending coffee",
      incurredDate: "2025-04-09",
      isCleared: false,
      createdAt: 3,
    },
  ];

  it("cash basis excludes pending transactions", () => {
    const ledger = buildAccountLedger(card, txs, "cash");
    expect(ledger.some((l) => l.description.includes("Pending"))).toBe(false);
  });

  it("accrual basis includes pending transactions", () => {
    const ledger = buildAccountLedger(card, txs, "accrual");
    expect(ledger.some((l) => l.description.includes("Pending"))).toBe(true);
  });

  it("projected cash basis includes pending using incurred date", () => {
    const projected = buildAccountLedgerProjected(card, txs, "cash");
    expect(projected.some((l) => l.description.includes("Pending"))).toBe(true);
    const pendingLine = projected.find((l) => l.description.includes("Pending"));
    expect(pendingLine?.sortDate).toBe("2025-04-09");
  });

  it("counts transfers without inflating expenses", () => {
    const { income, expense } = sumIncomeExpense(txs, "accrual");
    expect(income).toBe(0);
    expect(expense).toBe(50_00 + 12_00);
  });

  it("computes net worth using newest running balances", () => {
    const nw = netWorthCents(accounts, txs, "cash");
    expect(typeof nw).toBe("number");
  });
});
