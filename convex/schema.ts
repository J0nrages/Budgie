import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  accountSuggestionValidator,
  accountSubtypeValidator,
  accountTypeValidator,
  importJobStatusValidator,
  importRowStatusValidator,
  interestMethodValidator,
  statementFileStatusValidator,
  transactionTypeValidator,
} from "./validators";

export default defineSchema({
  accounts: defineTable({
    name: v.string(),
    type: accountTypeValidator,
    subtype: accountSubtypeValidator,
    issuer: v.optional(v.string()),
    institution: v.optional(v.string()),
    lastFour: v.optional(v.string()),
    initialBalanceCents: v.number(),
    creditLimitCents: v.optional(v.number()),
    aprBps: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    paymentDueDay: v.optional(v.number()),
    isDemo: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type_name", ["type", "name"])
    .index("by_issuer_lastFour", ["issuer", "lastFour"]),

  transactions: defineTable({
    type: transactionTypeValidator,
    amountCents: v.number(),
    accountId: v.optional(v.id("accounts")),
    fromAccountId: v.optional(v.id("accounts")),
    toAccountId: v.optional(v.id("accounts")),
    description: v.string(),
    category: v.optional(v.string()),
    incurredDate: v.string(),
    isCleared: v.boolean(),
    clearedDate: v.optional(v.string()),
    sourceImportRowId: v.optional(v.id("importRows")),
    sourceStatementFileId: v.optional(v.id("statementFiles")),
    duplicateKey: v.string(),
    isDemo: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_account_incurred", ["accountId", "incurredDate"])
    .index("by_from_incurred", ["fromAccountId", "incurredDate"])
    .index("by_to_incurred", ["toAccountId", "incurredDate"])
    .index("by_incurredDate", ["incurredDate"])
    .index("by_clearedDate", ["clearedDate"])
    .index("by_duplicateKey", ["duplicateKey"])
    .index("by_sourceImportRow", ["sourceImportRowId"])
    .index("by_sourceStatementFile", ["sourceStatementFileId"]),

  statementFiles: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    sha256: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    status: statementFileStatusValidator,
    redactedError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_sha256", ["sha256"])
    .index("by_account", ["accountId"])
    .index("by_status_account", ["status", "accountId"]),

  importJobs: defineTable({
    statementFileId: v.id("statementFiles"),
    accountId: v.optional(v.id("accounts")),
    status: importJobStatusValidator,
    workflowId: v.optional(v.string()),
    parserId: v.optional(v.string()),
    accountSuggestion: v.optional(accountSuggestionValidator),
    rowCount: v.number(),
    acceptedCount: v.number(),
    rejectedCount: v.number(),
    duplicateCount: v.number(),
    redactedError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_statementFile", ["statementFileId"])
    .index("by_account", ["accountId"]),

  importRows: defineTable({
    importJobId: v.id("importJobs"),
    statementFileId: v.id("statementFiles"),
    accountId: v.optional(v.id("accounts")),
    status: importRowStatusValidator,
    rowIndex: v.number(),
    rawSummary: v.string(),
    normalizedDescription: v.string(),
    normalizedCategory: v.optional(v.string()),
    normalizedIncurredDate: v.string(),
    normalizedAmountCents: v.number(),
    normalizedType: transactionTypeValidator,
    confidence: v.number(),
    duplicateKey: v.optional(v.string()),
    redactedError: v.optional(v.string()),
    acceptedTransactionId: v.optional(v.id("transactions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job_status", ["importJobId", "status"])
    .index("by_duplicateKey", ["duplicateKey"])
    .index("by_job_row", ["importJobId", "rowIndex"])
    .index("by_row_account", ["accountId"]),

  lenderProfiles: defineTable({
    accountId: v.id("accounts"),
    aprBps: v.optional(v.number()),
    gracePeriodDays: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    paymentDueDay: v.optional(v.number()),
    interestMethod: interestMethodValidator,
    isDemo: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_account", ["accountId"]),
});
