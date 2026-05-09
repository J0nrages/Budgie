# Household Planner Roadmap

## Purpose

This document is the concrete implementation plan for a richer household financial planner inside Budgie. It is based on the existing app architecture and on the interactive household planning artifact that models:

- 36-month cash flow
- debt payoff ordering
- savings-threshold policy
- apartment move timing and setup costs
- vehicle replacement / refinance / sell-and-replace branches
- milestone tracking and month-by-month simulation

This roadmap is written so a future AI agent can extend the application safely and incrementally.

## Current State

Budgie already has a lightweight scenario tool, but it is not a true household simulator.

- `src/components/budget/scenario-planner.tsx` supports monthly budget overrides and a simple cumulative balance comparison.
- `convex/budgetScenarios.ts` projects only baseline vs scenario surplus over `1..24` months.
- The current model does not support amortizing debts, one-time events, conditional vehicle strategies, savings rules, or avalanche payoff logic.

## Product Goal

Add a new household planning surface that can answer questions like:

- When do we hit the safety savings target?
- When does a BNPL debt clear and free up cash flow?
- What happens if we move in July instead of September?
- What is the tradeoff between keeping, refinancing, or selling the Bolt?
- How does a debt avalanche interact with a non-negotiable savings floor?

The planner should remain a decision-support tool, not an accounting source of truth.

## Non-Goals For V1

- No automatic syncing from live transactions into the simulation every month.
- No Monte Carlo or probabilistic modeling.
- No tax engine.
- No employment-change, inflation, or benefit-plan optimization engine.
- No attempt to replace the existing monthly budget planner.

## Core Principles

1. Keep the simulation engine pure.
2. Do not overload `budgetScenarios` with household-planner concerns.
3. Persist planner inputs and scenarios in Convex; derive projections from those inputs.
4. Keep money in integer cents and dates/months in explicit strings or month offsets.
5. Preserve explicit user policy rules in data, especially savings-floor behavior.
6. Build in phases so each phase ships a useful slice.

## Policy Invariants From The Planning Artifact

These rules should be treated as domain policy, not temporary UI defaults.

1. Fee/over-limit triage happens before optimization.
2. Credit-score recovery matters, not only mathematical APR minimization.
3. Savings floor is explicit policy.
4. The `$10k` safety threshold must be configurable but defaulted and clearly visible.
5. Allocation mode must support:
   - static percentage mode
   - tiered-by-cash mode
6. Debt payoff should support dynamic APR ordering, not hardcoded debt names.
7. One-time events must be first-class simulation inputs.

## Recommended Architecture

### Separation of concerns

- `src/lib/household-planner/*`
  - Pure types, simulation, allocation, amortization, milestone detection, and formatting helpers.
- `convex/householdPlans.ts`
  - Queries and mutations for plan/scenario persistence.
- `src/hooks/use-household-plans.ts`
  - Client hooks for the new planner API.
- `src/components/household-planner/*`
  - UI controls, chart, milestone cards, and month table.

### Why this should be separate from `budgetScenarios`

`budgetScenarios` is budget-line-item-centric. The household planner needs a different domain model:

- debts with balances, APRs, and minimums
- one-time events by month
- strategy toggles for vehicles and move timing
- policy-driven allocation rules
- month-by-month state transitions

Trying to force this into `budgetScenarios` would create a muddled schema and duplicate logic in awkward places.

## Data Model Recommendation

Use a small, explicit planner domain.

### Table 1: `householdPlans`

One row per saved planning workspace.

Suggested fields:

```ts
{
  name: string;
  description?: string;
  baseBudgetId?: Id<"budgets">;
  startMonth: string; // YYYY-MM
  horizonMonths: number; // default 36
  createdAt: number;
  updatedAt: number;
}
```

Purpose:

- groups related scenarios
- gives the planner a stable home in the UI
- optionally links back to an existing budget

### Table 2: `householdPlanScenarios`

One row per scenario. For v1, each scenario should be a self-contained input snapshot. This keeps simulation deterministic and easy to test.

Suggested fields:

```ts
{
  planId: Id<"householdPlans">;
  name: string;
  isBaseline: boolean;
  archivedAt?: number;
  input: HouseholdScenarioInput;
  createdAt: number;
  updatedAt: number;
}
```

### Input shape: `HouseholdScenarioInput`

Recommended shape:

```ts
type HouseholdScenarioInput = {
  household: {
    startMonth: string; // YYYY-MM
    horizonMonths: number;
    startingCashCents: number;
    monthlyNetIncomeCents: number;
    moveMonthOffset: number;
    moveCostCents: number;
    rentCents: number;
    cashFloorCents: number;
  };
  allocationPolicy: {
    strategy: "static" | "tiered";
    preMoveDebtPctBps: number;
    postMoveDebtPctBps: number;
    safetyThresholdCents: number;
    middleTierDebtPctBps: number;
    overflowThresholdCents: number;
  };
  livingExpenses: {
    key: string;
    label: string;
    monthlyCents: number;
  }[];
  utilityExpenses: {
    key: string;
    label: string;
    monthlyCents: number;
  }[];
  debts: {
    key: string;
    label: string;
    kind:
      | "creditCard"
      | "studentLoan"
      | "autoLoan"
      | "bnpl"
      | "personalLoan"
      | "otherInstallment";
    startBalanceCents: number;
    aprBps: number;
    minimumPaymentCents: number;
    creditLimitCents?: number;
    metadata?: {
      isScoreSensitive?: boolean;
      isOverLimitTriageTarget?: boolean;
    };
  }[];
  oneTimeEvents: {
    key: string;
    monthOffset: number;
    label: string;
    amountCents: number; // positive = inflow, negative = outflow
    kind:
      | "move"
      | "assetSale"
      | "vehiclePurchase"
      | "vehicleDownPayment"
      | "refiCost"
      | "debtTriage"
      | "custom";
  }[];
  vehicleStrategies: {
    bolt: {
      strategy: "keep" | "refi" | "sellAndReplace";
      currentBalanceCents: number;
      aprBps: number;
      currentPaymentCents: number;
      refiPaymentCents?: number;
      refiCostCents?: number;
      sellMonthOffset?: number;
      salePriceCents?: number;
      replacementVehicle?: {
        purchasePriceCents: number;
        downPaymentCents: number;
        aprBps: number;
        termMonths: number;
      };
    };
    secondVehicle: {
      strategy: "cashBeater" | "finance" | "lease";
      replacementMonthOffset: number;
      saleProceedsCents: number;
      upfrontCostCents: number;
      recurringPaymentCents: number;
      recurringTermMonths: number;
    };
  };
};
```

### Why a single `input` snapshot is recommended for v1

- easier versioning
- fewer cross-table consistency issues
- safer for AI agents to extend
- deterministic simulations without partial writes

If the planner later grows into a much larger system, debts/events/vehicles can be normalized then.

## Derived Output Model

Do not persist monthly projections in v1 unless performance becomes a problem.

Return a derived structure from a Convex query such as:

```ts
type HouseholdProjection = {
  summary: {
    hitSafetyMonth?: string;
    hit10kMonth?: string;
    affirmPaidOffMonth?: string;
    highRateDebtFreeMonth?: string;
    allDebtFreeMonth?: string;
    totalInterestPaidCents: number;
    endingCashCents: number;
    endingDebtCents: number;
  };
  series: {
    month: string;
    cashCents: number;
    debtByKey: Record<string, number>;
    totalDebtCents: number;
    extraDebtPaymentCents: number;
    savingsContributionCents: number;
    events: string[];
  }[];
};
```

## Simulation Engine Requirements

The engine should live in pure TypeScript under `src/lib/household-planner/`.

Recommended files:

- `types.ts`
- `simulate.ts`
- `allocation.ts`
- `amortization.ts`
- `events.ts`
- `milestones.ts`
- `validators.ts`

### Engine rules

1. Simulation is month-stepped.
2. Every month should run the same ordered pipeline.
3. Each debt should amortize from explicit balance, APR, and mandatory payment.
4. Extra payments should use a sorted avalanche list based on current APR.
5. Allocation policy should decide how much free cash goes to debt vs savings.
6. One-time events should be applied before free-cash allocation.
7. The engine should emit enough per-month detail for charts and tables.

### Recommended month order of operations

1. Add income.
2. Subtract recurring living costs.
3. If post-move, subtract rent and utilities.
4. Apply one-time events scheduled for the month.
5. Apply vehicle strategy transitions if they trigger this month.
6. Apply mandatory installment payments and interest.
7. Compute free cash.
8. Apply allocation policy.
9. Apply avalanche extra payments.
10. Detect milestones and capture event labels.

This ordering should be encoded in comments in `simulate.ts` and tested directly.

## UI Plan

## Entry point recommendation

Do not replace the existing scenario planner.

Recommended options:

1. Add a new `Household` tab inside `BudgetPlanner`.
2. Or add a planner mode switch inside the existing `Scenarios` tab.

Recommendation: add a separate `Household` tab. It avoids confusing monthly budget what-ifs with long-horizon household simulations.

### Core UI sections

1. Plan picker
2. Scenario picker
3. Levers / assumptions panel
4. Allocation policy panel
5. Vehicle strategy panel
6. Debt inventory panel
7. Milestone cards
8. Projection chart
9. Month-by-month table

### UI behavior guidance

- Use optimistic local editing only after a stable persistence model exists.
- Keep inputs controlled and derived values explicit.
- Show representative monthly flow cards, but label them as approximations.
- Surface policy assumptions in copy, especially savings-floor behavior.
- Do not hide one-time events inside generic notes; show them visibly in the month table.

## Phased Delivery Plan

## Phase 0: Spec Lock And Boundaries

Goal: turn the household HTML artifact into explicit domain rules before adding schema.

Tasks:

1. Create `src/lib/household-planner/types.ts` with input/output types only.
2. Document domain assumptions inline in comments.
3. Encode key policy invariants in type names and validator helpers.
4. Decide final naming for high-rate debt milestones and event kinds.

Acceptance criteria:

- One canonical `HouseholdScenarioInput` type exists.
- One canonical `HouseholdProjection` type exists.
- No simulation logic exists yet.
- Types are pure and reusable by both client and Convex.

## Phase 1: Pure Simulation Engine

Goal: ship a tested, non-UI engine that can reproduce the planning artifact’s logic.

Tasks:

1. Implement amortization helpers for installment debts.
2. Implement allocation policy helpers for static and tiered modes.
3. Implement one-time event application.
4. Implement vehicle strategy transitions.
5. Implement avalanche routing with dynamic APR sorting.
6. Implement milestone detection.
7. Add fixture-driven tests for the baseline scenario.

Acceptance criteria:

- `simulateHouseholdScenario(input)` returns a 36-month projection.
- The engine is pure and has no React or Convex imports.
- Tests cover:
  - static allocation
  - tiered allocation
  - debt payoff order
  - BNPL payoff freeing cash flow
  - move month cost application
  - Bolt sell-and-replace branch
  - cash floor enforcement

## Phase 2: Convex Persistence

Goal: persist plans and scenarios without persisting monthly rows.

Tasks:

1. Add `householdPlans` and `householdPlanScenarios` to `convex/schema.ts`.
2. Add validators for `HouseholdScenarioInput` in `convex/validators.ts` or a planner-specific validator file.
3. Implement `convex/householdPlans.ts` queries and mutations.
4. Implement a projection query that loads a scenario and runs the pure engine.
5. Add client hooks in `src/hooks/use-household-plans.ts`.

Recommended API surface:

- `listPlans`
- `getPlan`
- `createPlan`
- `updatePlan`
- `removePlan`
- `listScenarios`
- `getScenario`
- `createScenario`
- `updateScenario`
- `archiveScenario`
- `getScenarioProjection`

Acceptance criteria:

- A user can create a plan and scenario in local single-user mode.
- A projection query returns deterministic monthly output from stored input.
- Scenario edits round-trip through Convex without lossy transforms.

## Phase 3: Minimal End-To-End UI

Goal: make the planner usable before building the full polished artifact.

Tasks:

1. Add a new `Household` tab under `BudgetPlanner`.
2. Build a minimal plan/scenario picker.
3. Add basic editable fields for:
   - starting cash
   - monthly net income
   - rent
   - move month
   - safety threshold
4. Render milestone cards.
5. Render a basic line chart for cash and total debt.
6. Render a month table with `cash`, `total debt`, and `events`.

Acceptance criteria:

- A user can create one scenario and see projection results.
- Changes to core inputs immediately change the chart and milestones.
- The UI works on desktop and mobile.

## Phase 4: Full Assumptions Editor

Goal: support the key planner controls from the artifact.

Tasks:

1. Add living-expense category editors.
2. Add utility editors.
3. Add debt inventory editor with APR, balance, minimum payment, and optional metadata.
4. Add allocation strategy switch and thresholds.
5. Add vehicle strategy controls for Bolt and second vehicle.
6. Add one-time event editor.
7. Add copy that explains policy behavior.

Acceptance criteria:

- The planner can express all major controls from the original HTML artifact.
- Scenario input is saved cleanly as structured data.
- The UI does not require hardcoded debt names outside display labels.

## Phase 5: Rich Visualization And Insights

Goal: match the decision-support quality of the artifact.

Tasks:

1. Split chart series into:
   - cash
   - high-rate debt
   - other debt
2. Add representative monthly cash flow cards.
3. Add event highlighting in the month table.
4. Add milestone annotations and warning states.
5. Add delta columns for cash and debt changes.
6. Add scenario comparison against baseline.

Acceptance criteria:

- The planner makes key transitions visually obvious.
- A user can understand why balances changed in a given month.
- Baseline vs alternative scenario comparison is available.

## Phase 6: Hardening And QA

Goal: make the planner reliable enough to keep evolving.

Tasks:

1. Add validation for malformed month offsets, negative balances, and inconsistent strategy payloads.
2. Add regression fixtures for known household scenarios.
3. Add UI tests for major flows if the repo introduces a browser test runner.
4. Add performance checks for 36-month projections and multiple scenarios.
5. Document assumptions and caveats in the UI.

Acceptance criteria:

- Invalid scenarios fail with clear errors.
- Regression fixtures catch changes in payoff timing and milestone dates.
- `bun run lint`, `bun run typecheck`, and `bun run test` pass.

## Suggested Task Breakdown For An AI Agent

Use this order unless the user asks otherwise.

1. Add pure planner types.
2. Add pure simulation tests before wiring UI.
3. Implement the engine to satisfy tests.
4. Add Convex schema and projection query.
5. Add hooks.
6. Add minimal UI.
7. Expand editor coverage.
8. Add richer visualizations.

## Testing Strategy

### Unit tests

Put pure engine tests in `tests/household-planner.test.ts` or a small test folder.

Minimum cases:

1. Savings floor blocks extra debt payment below threshold.
2. Middle tier splits free cash correctly.
3. Overflow tier routes all extra cash to debt.
4. Avalanche order changes when APRs change.
5. Mandatory payments stop once a debt reaches zero.
6. One-time move costs hit exactly once.
7. Sell-and-replace creates the replacement loan balance correctly.
8. Month labels and offsets are deterministic.

### Regression fixtures

Add one or more fixtures that mirror the original household artifact assumptions. The test should assert milestone timing, ending balances, and total interest within a stable expected output.

### Query tests

If Convex function tests are added later, verify that scenario storage and projection queries round-trip without mutating numeric values.

## Validation Rules

Minimum validation rules:

1. `startMonth` must be `YYYY-MM`.
2. `horizonMonths` must be between `1` and `60`.
3. Month offsets must be between `0` and `horizonMonths - 1`.
4. Balances, thresholds, and payments must be non-negative.
5. `overflowThresholdCents` must be `>= safetyThresholdCents`.
6. Finance/lease term months must be positive if recurring payment is non-zero.
7. Sell-and-replace strategies must include sale month and replacement payload.

## Migration And Versioning Guidance

The original artifact used version labels like `v7` and `v8`. Preserve versioning at the scenario-input level instead of only in UI text.

Recommended addition:

```ts
type HouseholdScenarioInput = {
  version: 1;
  // ...rest of payload
};
```

If the shape changes later, bump the version and add an upgrade helper in `src/lib/household-planner/`.

## UX Notes

1. Make policy visible, not implicit.
2. Show exact thresholds and payoff milestones.
3. Use clear warnings when a scenario never reaches a target within the horizon.
4. Distinguish approximation cards from the authoritative month table.
5. Preserve mobile usability for long control panels and tables.

## Risks And Failure Modes

1. Mixing monthly budget logic and household simulation logic into one schema.
2. Duplicating math between client and Convex.
3. Hardcoding debt names into payoff logic.
4. Persisting derived rows too early and creating stale projections.
5. Treating debt avalanche as the only policy, ignoring the explicit savings-floor rule.

## Definition Of Done For V1

V1 is complete when all of the following are true:

1. A user can create a household plan and at least one scenario.
2. A stored scenario can project a 36-month plan.
3. The planner supports both static and tiered allocation.
4. The planner supports debt amortization and dynamic avalanche routing.
5. The planner supports one-time move and vehicle events.
6. The UI shows milestones, a chart, and a month table.
7. The planner logic is covered by stable tests.

## Nice-To-Have Later

1. Scenario cloning from baseline.
2. Side-by-side scenario comparison.
3. Account/budget seeding into household assumptions.
4. Export to JSON or printable plan summary.
5. Optional manual notes per event or debt.
6. Consolidation-loan recommendation helpers after score-recovery milestones.

## Implementation Notes For Future Agents

1. Read `docs/architecture.md` before coding.
2. Keep planner math in `src/lib`, not inside components.
3. Prefer a self-contained `input` snapshot schema for early versions.
4. Do not refactor the existing `budgetScenarios` system into this domain unless explicitly asked.
5. Ship the engine and tests before polishing the UI.
6. Preserve deterministic results: avoid implicit wall-clock behavior inside queries.
