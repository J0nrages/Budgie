/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as budgetReports from "../budgetReports.js";
import type * as budgetScenarios from "../budgetScenarios.js";
import type * as budgets from "../budgets.js";
import type * as categories from "../categories.js";
import type * as importActions from "../importActions.js";
import type * as importWorkflow from "../importWorkflow.js";
import type * as importWorkflowSteps from "../importWorkflowSteps.js";
import type * as imports from "../imports.js";
import type * as lib_accountRecords from "../lib/accountRecords.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_budgetMath from "../lib/budgetMath.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_datesIso from "../lib/datesIso.js";
import type * as lib_firecrawl from "../lib/firecrawl.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_importReview from "../lib/importReview.js";
import type * as lib_merchantKey from "../lib/merchantKey.js";
import type * as lib_redaction from "../lib/redaction.js";
import type * as lib_statementReconciliation from "../lib/statementReconciliation.js";
import type * as lib_workflow from "../lib/workflow.js";
import type * as merchants from "../merchants.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as statements from "../statements.js";
import type * as transactions from "../transactions.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  budgetReports: typeof budgetReports;
  budgetScenarios: typeof budgetScenarios;
  budgets: typeof budgets;
  categories: typeof categories;
  importActions: typeof importActions;
  importWorkflow: typeof importWorkflow;
  importWorkflowSteps: typeof importWorkflowSteps;
  imports: typeof imports;
  "lib/accountRecords": typeof lib_accountRecords;
  "lib/auth": typeof lib_auth;
  "lib/budgetMath": typeof lib_budgetMath;
  "lib/categories": typeof lib_categories;
  "lib/datesIso": typeof lib_datesIso;
  "lib/firecrawl": typeof lib_firecrawl;
  "lib/hash": typeof lib_hash;
  "lib/ids": typeof lib_ids;
  "lib/importReview": typeof lib_importReview;
  "lib/merchantKey": typeof lib_merchantKey;
  "lib/redaction": typeof lib_redaction;
  "lib/statementReconciliation": typeof lib_statementReconciliation;
  "lib/workflow": typeof lib_workflow;
  merchants: typeof merchants;
  reports: typeof reports;
  seed: typeof seed;
  statements: typeof statements;
  transactions: typeof transactions;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
