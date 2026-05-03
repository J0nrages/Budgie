"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

export function useAccounts() {
  const accounts = useQuery(api.accounts.list);
  const createAccount = useMutation(api.accounts.create);
  const updateAccount = useMutation(api.accounts.update);
  const deleteAccount = useMutation(api.accounts.remove);

  return {
    accounts,
    createAccount,
    updateAccount,
    deleteAccount,
  };
}

export type AccountId = Id<"accounts">;
