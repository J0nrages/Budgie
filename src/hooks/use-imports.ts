"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

/**
 * `selectedJobId` is the user override; when undefined we fall back to the newest job so queries stay reactive without extra effects.
 */
export function useImports(selectedJobId: Id<"importJobs"> | undefined) {
  const jobs = useQuery(api.imports.listImportJobs);
  const effectiveJobId = selectedJobId ?? jobs?.[0]?._id;
  const accountSuggestion = useQuery(
    api.imports.getAccountSuggestionForJob,
    effectiveJobId ? { importJobId: effectiveJobId } : "skip",
  );

  const rows = useQuery(
    api.imports.listImportRows,
    effectiveJobId ? { importJobId: effectiveJobId } : "skip",
  );
  const updateRow = useMutation(api.imports.updateReviewRow);
  const acceptRow = useMutation(api.imports.acceptImportRow);
  const rejectRow = useMutation(api.imports.rejectImportRow);
  const rejectAll = useMutation(api.imports.rejectAllImportRows);
  const linkImportJobToAccount = useMutation(api.imports.linkImportJobToAccount);
  const uploadUrl = useMutation(api.statements.generateUploadUrl);
  const finalizeUpload = useMutation(api.statements.finalizeUploadedStatement);

  return {
    jobs,
    rows,
    effectiveJobId,
    accountSuggestion,
    updateRow,
    acceptRow,
    rejectRow,
    rejectAll,
    linkImportJobToAccount,
    uploadUrl,
    finalizeUpload,
  };
}
