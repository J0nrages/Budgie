import { v } from "convex/values";
import { internal } from "./_generated/api";
import { workflowManager } from "./lib/workflow";

export const importStatementWorkflow = workflowManager.define({
  args: { importJobId: v.id("importJobs") },
  returns: v.null(),
}).handler(async (step, args) => {
  await step.runMutation(internal.importWorkflowSteps.markJobProcessing, {
    importJobId: args.importJobId,
  });

  const parsed = await step.runAction(
    internal.importActions.parseStatementForImportJob,
    { importJobId: args.importJobId },
    { retry: true },
  );

  await step.runMutation(internal.importWorkflowSteps.persistParseResults, {
    importJobId: args.importJobId,
    parserId: parsed.parserId,
    accountSuggestion: parsed.accountSuggestion,
    parserWarnings: parsed.parserWarnings,
    fatalError: parsed.fatalError,
    rows: parsed.rows,
  });

  return null;
});
