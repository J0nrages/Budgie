/** Client-side mirror of Convex budget enums for UI typing. */

export type PaceStatus =
  | "underPace"
  | "nearPace"
  | "overPace"
  | "overBudget";

export type BudgetCadence = "weekly" | "monthly" | "yearly" | "byDate";

export type BudgetTargetType =
  | "spending"
  | "savingsBalance"
  | "monthlyBuilder";

export type WaterfallTier = "fixed" | "flexible" | "savings";

export type ScenarioType = "budgetTweak" | "lifeChange";
