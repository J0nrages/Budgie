import type { AccountSubtype, AccountType, ImportRowStatus } from "../types/finance";

export type ImportSummaryRow = {
  status: ImportRowStatus;
};

export function summarizeImportRows(rows: ImportSummaryRow[]) {
  let acceptedCount = 0;
  let readyCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;
  let rejectedCount = 0;

  for (const row of rows) {
    switch (row.status) {
      case "accepted":
        acceptedCount += 1;
        break;
      case "needsReview":
        readyCount += 1;
        break;
      case "duplicate":
        duplicateCount += 1;
        break;
      case "error":
        errorCount += 1;
        break;
      case "rejected":
        rejectedCount += 1;
        break;
    }
  }

  const exceptionCount = duplicateCount + errorCount;

  return {
    acceptedCount,
    readyCount,
    duplicateCount,
    errorCount,
    rejectedCount,
    exceptionCount,
    canApplyReadyRows: readyCount > 0,
    shouldAutoApplyReadyRows: readyCount > 0 && exceptionCount > 0,
  };
}

export function buildSuggestedAccountDraft(
  suggestion:
    | {
        issuer?: string;
        lastFour?: string;
      }
    | null
    | undefined,
): {
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
} {
  if (suggestion?.issuer === "Discover") {
    return {
      name: `${suggestion.issuer} ${suggestion.lastFour ?? ""}`.trim(),
      type: "liability",
      subtype: "creditCard",
    };
  }

  if (suggestion?.issuer) {
    return {
      name: `${suggestion.issuer} ${suggestion.lastFour ?? ""}`.trim(),
      type: "asset",
      subtype: "checking",
    };
  }

  return {
    name: "",
    type: "asset",
    subtype: "checking",
  };
}
