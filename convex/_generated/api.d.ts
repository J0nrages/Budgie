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
import type * as importActions from "../importActions.js";
import type * as importWorkflow from "../importWorkflow.js";
import type * as importWorkflowSteps from "../importWorkflowSteps.js";
import type * as imports from "../imports.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_datesIso from "../lib/datesIso.js";
import type * as lib_firecrawl from "../lib/firecrawl.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_redaction from "../lib/redaction.js";
import type * as lib_workflow from "../lib/workflow.js";
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
  importActions: typeof importActions;
  importWorkflow: typeof importWorkflow;
  importWorkflowSteps: typeof importWorkflowSteps;
  imports: typeof imports;
  "lib/auth": typeof lib_auth;
  "lib/datesIso": typeof lib_datesIso;
  "lib/firecrawl": typeof lib_firecrawl;
  "lib/hash": typeof lib_hash;
  "lib/ids": typeof lib_ids;
  "lib/redaction": typeof lib_redaction;
  "lib/workflow": typeof lib_workflow;
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
