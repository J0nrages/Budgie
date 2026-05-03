"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

export function useTransactions(accountId?: Id<"accounts">) {
  const transactions = useQuery(api.transactions.list, {
    accountId,
    limit: 500,
  });
  const createTx = useMutation(api.transactions.create);
  const updateTx = useMutation(api.transactions.update);
  const deleteTx = useMutation(api.transactions.remove);

  return { transactions, createTx, updateTx, deleteTx };
}
