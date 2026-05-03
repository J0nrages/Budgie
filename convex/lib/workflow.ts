import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "../_generated/api";

export const workflowManager = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 10,
    retryActionsByDefault: true,
    defaultRetryBehavior: {
      base: 2,
      initialBackoffMs: 100,
      maxAttempts: 3,
    },
  },
});
