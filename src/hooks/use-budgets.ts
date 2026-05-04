"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

export function useBudgets() {
  const list = useQuery(api.budgets.list);
  const active = useQuery(api.budgets.getActive);
  const historicalAverages = useQuery(api.budgets.historicalAverages, {});
  const create = useMutation(api.budgets.create);
  const update = useMutation(api.budgets.update);
  const remove = useMutation(api.budgets.remove);
  const setActive = useMutation(api.budgets.setActive);
  const createLineItem = useMutation(api.budgets.createLineItem);
  const updateLineItem = useMutation(api.budgets.updateLineItem);
  const removeLineItem = useMutation(api.budgets.removeLineItem);
  const reorderLineItems = useMutation(api.budgets.reorderLineItems);

  return {
    list,
    active,
    historicalAverages,
    create,
    update,
    remove,
    setActive,
    createLineItem,
    updateLineItem,
    removeLineItem,
    reorderLineItems,
  };
}

export function useBudgetWithLineItems(budgetId: Id<"budgets"> | undefined) {
  return useQuery(
    api.budgets.getWithLineItems,
    budgetId ? { budgetId } : "skip",
  );
}
