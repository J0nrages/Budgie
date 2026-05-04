import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  accountSuggestionValidator,
  normalizedRowValidator,
} from "./validators";
import { parsePdfWithFirecrawl } from "./lib/firecrawl";
import { sha256Hex } from "./lib/hash";
import { redactErrorMessage } from "./lib/redaction";
import { chooseParser } from "../src/lib/parsers/registry";
import { normalizeParserRows } from "../src/lib/statement-normalization";

const MAX_BYTES = 10 * 1024 * 1024;

const PDF_FIRECRAWL_UNAVAILABLE_HINT =
  "PDF parsing requires FIRECRAWL_API_KEY in the Convex environment. " +
  "Set FIRECRAWL_API_KEY to enable Firecrawl /parse, or upload the statement as CSV instead.";

export const parseStatementForImportJob = internalAction({
  args: { importJobId: v.id("importJobs") },
  returns: v.object({
    parserId: v.string(),
    accountSuggestion: v.optional(accountSuggestionValidator),
    parserWarnings: v.array(v.string()),
    fatalError: v.optional(v.string()),
    rows: v.array(normalizedRowValidator),
  }),
  handler: async (ctx, args) => {
    try {
      const meta = await ctx.runQuery(
        internal.importWorkflowSteps.getJobContext,
        { importJobId: args.importJobId },
      );
      if (!meta) {
        return {
          parserId: "unknown",
          accountSuggestion: undefined,
          parserWarnings: [],
          fatalError: "Import job not found.",
          rows: [],
        };
      }

      const updateProgress = async (
        stage:
          | "loadingFile"
          | "verifyingHash"
          | "firecrawlParse"
          | "choosingParser"
          | "normalizingRows",
        message: string,
        percent: number,
      ) => {
        await ctx.runMutation(internal.importWorkflowSteps.updateJobProgress, {
          importJobId: args.importJobId,
          stage,
          message,
          percent,
        });
      };

      if (meta.sizeBytes <= 0 || meta.sizeBytes > MAX_BYTES) {
        return {
            parserId: "unknown",
            accountSuggestion: undefined,
            parserWarnings: [],
            fatalError: redactErrorMessage(
              "File is empty or exceeds the maximum allowed size.",
            ),
          rows: [],
        };
      }

      await updateProgress("loadingFile", "Loading uploaded file from storage.", 15);
      const blob = await ctx.storage.get(meta.storageId);
      if (!blob) {
        return {
          parserId: "unknown",
          accountSuggestion: undefined,
          parserWarnings: [],
          fatalError: "Uploaded file could not be loaded from storage.",
          rows: [],
        };
      }

      const buf = await blob.arrayBuffer();
      if (meta.sha256) {
        await updateProgress("verifyingHash", "Verifying uploaded file hash.", 25);
        const actualSha256 = await sha256Hex(buf);
        if (actualSha256 !== meta.sha256) {
          return {
            parserId: "unknown",
            accountSuggestion: undefined,
            parserWarnings: [],
            fatalError: redactErrorMessage(
              "Uploaded file contents did not match the recorded file hash.",
            ),
            rows: [],
          };
        }
      }

      const isPdf =
        meta.contentType.toLowerCase().includes("pdf") ||
        meta.fileName.toLowerCase().endsWith(".pdf");
      let extractedText = new TextDecoder("utf-8").decode(buf);
      let extractedMarkdown: string | undefined;
      if (isPdf) {
        if (!process.env.FIRECRAWL_API_KEY) {
          return {
            parserId: "unknown",
            accountSuggestion: undefined,
            parserWarnings: [],
            fatalError: PDF_FIRECRAWL_UNAVAILABLE_HINT,
            rows: [],
          };
        }

        try {
          await updateProgress(
            "firecrawlParse",
            "Sending PDF to Firecrawl /parse.",
            40,
          );
          const firecrawlPdf = await parsePdfWithFirecrawl({
            data: buf,
            fileName: meta.fileName,
            contentType: meta.contentType,
            mode: "auto",
          });
          extractedText = firecrawlPdf.markdown;
          extractedMarkdown = firecrawlPdf.markdown;
          await updateProgress(
            "firecrawlParse",
            "Firecrawl returned parsed Markdown.",
            65,
          );
        } catch (err) {
          const parseMessage = err instanceof Error ? err.message : String(err);
          return {
            parserId: "unknown",
            accountSuggestion: undefined,
            parserWarnings: [],
            fatalError: redactErrorMessage(
              `Firecrawl PDF parse failed: ${parseMessage}`,
            ),
            rows: [],
          };
        }
      }

      await updateProgress("choosingParser", "Choosing statement parser.", 70);
      const parserInput = {
        fileName: meta.fileName,
        contentType: meta.contentType,
        sizeBytes: buf.byteLength,
        text: extractedText,
        markdown: extractedMarkdown,
      };

      const choice = chooseParser(parserInput);
      const parsed = choice.run(parserInput);

      if (!parsed.ok) {
        return {
          parserId: choice.parserId,
          accountSuggestion: undefined,
          parserWarnings: [],
          fatalError: redactErrorMessage(parsed.message),
          rows: [],
        };
      }

      await updateProgress("normalizingRows", "Normalizing parsed rows.", 80);
      const normalized = normalizeParserRows(parsed.rows);
      const rows = normalized.map((r) => ({
        rowIndex: r.rowIndex,
        rawSummary: r.rawSummary,
        sourceReference: r.sourceReference,
        sourcePage: r.sourcePage,
        normalizedDescription: r.normalizedDescription,
        originalDescription: r.originalDescription,
        memo: r.memo,
        merchantName: r.merchantName,
        normalizedMerchantName: r.normalizedMerchantName,
        suggestedMerchantName: r.suggestedMerchantName,
        normalizedCategory: r.normalizedCategory,
        normalizedIncurredDate: r.normalizedIncurredDate,
        normalizedTransactionDate: r.normalizedTransactionDate,
        normalizedPostedDate: r.normalizedPostedDate,
        normalizedAmountCents: r.normalizedAmountCents,
        normalizedType: r.normalizedType,
        bankTransactionId: r.bankTransactionId,
        referenceNumber: r.referenceNumber,
        checkNumber: r.checkNumber,
        currencyCode: r.currencyCode,
        importedBalanceCents: r.importedBalanceCents,
        postingStatus: r.postingStatus,
        pendingMatchesKey: r.pendingMatchesKey,
        confidence: r.confidence,
        rowError: r.rowError,
      }));

      return {
        parserId: choice.parserId,
        accountSuggestion: parsed.accountSuggestion,
        parserWarnings: parsed.warnings.map((warning) => warning.message),
        rows,
      };
    } catch (err) {
      // Last-resort safety net: any unexpected throw must still reach
      // `persistParseResults`, otherwise the workflow dies and the job is
      // permanently stuck in `processing` with no surfaced failure.
      const message = err instanceof Error ? err.message : String(err);
      return {
        parserId: "unknown",
        accountSuggestion: undefined,
        parserWarnings: [],
        fatalError: redactErrorMessage(`Parser action crashed: ${message}`),
        rows: [],
      };
    }
  },
});
