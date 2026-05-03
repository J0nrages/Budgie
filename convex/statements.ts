import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { assertSingleUserLocalMode } from "./lib/auth";
import { workflowManager } from "./lib/workflow";

const MAX_BYTES = 10 * 1024 * 1024;

const finalizeStatementResultValidator = v.union(
  v.object({
    kind: v.literal("started"),
    statementFileId: v.id("statementFiles"),
    importJobId: v.id("importJobs"),
  }),
  v.object({
    kind: v.literal("duplicate"),
    duplicateOfStatementFileId: v.id("statementFiles"),
    existingFileName: v.string(),
  }),
);

function normalizeSha256(value: string): string {
  const sha256 = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Invalid file hash.");
  }
  return sha256;
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.object({ uploadUrl: v.string() }),
  handler: async (ctx): Promise<{ uploadUrl: string }> => {
    assertSingleUserLocalMode();
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});

export const finalizeUploadedStatement = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    sha256: v.string(),
    accountId: v.optional(v.id("accounts")),
  },
  returns: finalizeStatementResultValidator,
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        kind: "started";
        statementFileId: Id<"statementFiles">;
        importJobId: Id<"importJobs">;
      }
    | {
        kind: "duplicate";
        duplicateOfStatementFileId: Id<"statementFiles">;
        existingFileName: string;
      }
  > => {
    assertSingleUserLocalMode();
    if (args.sizeBytes <= 0 || args.sizeBytes > MAX_BYTES) {
      throw new Error("File must be non-empty and under the maximum upload size.");
    }

    const fileName = args.fileName.trim();
    if (fileName.length === 0) throw new Error("File name is required");
    const sha256 = normalizeSha256(args.sha256);

    if (args.accountId) {
      const acct = await ctx.db.get(args.accountId);
      if (!acct) throw new Error("Linked account was not found");
    }

    const duplicate = await ctx.db
      .query("statementFiles")
      .withIndex("by_sha256", (q) => q.eq("sha256", sha256))
      .first();
    if (duplicate) {
      await ctx.storage.delete(args.storageId);
      return {
        kind: "duplicate",
        duplicateOfStatementFileId: duplicate._id,
        existingFileName: duplicate.fileName,
      };
    }

    const now = Date.now();
    const statementFileId = await ctx.db.insert("statementFiles", {
      storageId: args.storageId,
      fileName,
      contentType: args.contentType,
      sizeBytes: args.sizeBytes,
      sha256,
      accountId: args.accountId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    const importJobId = await ctx.db.insert("importJobs", {
      statementFileId,
      accountId: args.accountId,
      status: "queued",
      rowCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const workflowId = await workflowManager.start(
      ctx,
      internal.importWorkflow.importStatementWorkflow,
      { importJobId },
    );

    await ctx.db.patch(importJobId, {
      workflowId,
      updatedAt: Date.now(),
    });

    return { kind: "started", statementFileId, importJobId };
  },
});

export const listStatementFiles = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx): Promise<Doc<"statementFiles">[]> => {
    assertSingleUserLocalMode();
    return await ctx.db.query("statementFiles").order("desc").take(200);
  },
});

export const getStatementFile = query({
  args: { statementFileId: v.id("statementFiles") },
  returns: v.union(v.any(), v.null()),
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"statementFiles"> | null> => {
    assertSingleUserLocalMode();
    return await ctx.db.get(args.statementFileId);
  },
});

export const updateStatementAccountLink = mutation({
  args: {
    statementFileId: v.id("statementFiles"),
    accountId: v.optional(v.id("accounts")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSingleUserLocalMode();
    const file = await ctx.db.get(args.statementFileId);
    if (!file) throw new Error("Statement file not found");

    if (args.accountId) {
      const acct = await ctx.db.get(args.accountId);
      if (!acct) throw new Error("Account not found");
    }

    await ctx.db.patch(args.statementFileId, {
      accountId: args.accountId,
      updatedAt: Date.now(),
    });

    const job = await ctx.db
      .query("importJobs")
      .withIndex("by_statementFile", (q) =>
        q.eq("statementFileId", args.statementFileId),
      )
      .first();
    if (job) {
      await ctx.db.patch(job._id, {
        accountId: args.accountId,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});
