"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";

export function useCategories() {
  const groups = useQuery(api.categories.listGroups);
  const all = useQuery(api.categories.listAll);
  const suggestions = useQuery(api.categories.suggestFromTransactions, {});
  const createGroup = useMutation(api.categories.createGroup);
  const updateGroup = useMutation(api.categories.updateGroup);
  const removeGroup = useMutation(api.categories.removeGroup);
  const createCategory = useMutation(api.categories.create);
  const updateCategory = useMutation(api.categories.update);
  const removeCategory = useMutation(api.categories.remove);
  const seedFromTransactions = useMutation(api.categories.seedFromTransactions);
  const reorderGroups = useMutation(api.categories.reorderGroups);
  const reorderCategories = useMutation(api.categories.reorderCategories);

  return {
    groups,
    all,
    allGroups: all?.groups ?? groups,
    categories: all?.categories,
    suggestions,
    createGroup,
    updateGroup,
    removeGroup,
    createCategory,
    updateCategory,
    removeCategory,
    seedFromTransactions,
    reorderGroups,
    reorderCategories,
  };
}
