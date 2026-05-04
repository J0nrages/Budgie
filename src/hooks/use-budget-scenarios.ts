"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

export function useBudgetScenarios(baseBudgetId: Id<"budgets"> | undefined) {
  const list = useQuery(
    api.budgetScenarios.list,
    baseBudgetId ? { baseBudgetId } : "skip",
  );
  const create = useMutation(api.budgetScenarios.create);
  const update = useMutation(api.budgetScenarios.update);
  const remove = useMutation(api.budgetScenarios.remove);

  return { list, create, update, remove };
}

export function useScenarioProjection(scenarioId: Id<"budgetScenarios"> | undefined) {
  return useQuery(
    api.budgetScenarios.getWithProjection,
    scenarioId ? { scenarioId } : "skip",
  );
}

export function useScenario(scenarioId: Id<"budgetScenarios"> | undefined) {
  return useQuery(
    api.budgetScenarios.get,
    scenarioId ? { scenarioId } : "skip",
  );
}
