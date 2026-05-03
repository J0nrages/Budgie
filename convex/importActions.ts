import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { normalizedRowValidator } from "./importWorkflowSteps";
import { accountSuggestionValidator } from "./validators";
import { parsePdfWithFirecrawl } from "./lib/firecrawl";
import { sha256Hex } from "./lib/hash";
import { redactErrorMessage } from "./lib/redaction";
import { chooseParser } from "../src/lib/parsers/registry";
import { extractTextWithUnpdf } from "../src/lib/parsers/pdf-extract";
import { normalizeParserRows } from "../src/lib/statement-normalization";

const MAX_BYTES = 10 * 1024 * 1024;

function hasEnoughExtractedPdfText(text: string, itemCount: number): boolean {
  const condensed = text.replace(/\s+/g, "");
  return condensed.length >= 200 && itemCount >= 20;
}

export const parseStatementForImportJob = internalAction({
  args: { importJobId: v.id("importJobs") },
  returns: v.object({
    parserId: v.string(),
    accountSuggestion: v.optional(accountSuggestionValidator),
    fatalError: v.optional(v.string()),
    rows: v.array(normalizedRowValidator),
  }),
  handler: async (ctx, args) => {
    const meta = await ctx.runQuery(internal.importWorkflowSteps.getJobContext, {
      importJobId: args.importJobId,
    });
    if (!meta) {
      return {
        parserId: "unknown",
        accountSuggestion: undefined,
        fatalError: "Import job not found.",
        rows: [],
      };
    }

    if (meta.sizeBytes <= 0 || meta.sizeBytes > MAX_BYTES) {
      return {
        parserId: "unknown",
        accountSuggestion: undefined,
        fatalError: redactErrorMessage(
          "File is empty or exceeds the maximum allowed size.",
        ),
        rows: [],
      };
    }

    const blob = await ctx.storage.get(meta.storageId);
    if (!blob) {
      return {
        parserId: "unknown",
        accountSuggestion: undefined,
        fatalError: "Uploaded file could not be loaded from storage.",
        rows: [],
      };
    }

    const buf = await blob.arrayBuffer();
    if (meta.sha256) {
      const actualSha256 = await sha256Hex(buf);
      if (actualSha256 !== meta.sha256) {
        return {
          parserId: "unknown",
          accountSuggestion: undefined,
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
      const localPdf = await extractTextWithUnpdf(buf);
      extractedText = localPdf.text;

      if (
        !hasEnoughExtractedPdfText(localPdf.text, localPdf.items.length) &&
        process.env.FIRECRAWL_API_KEY
      ) {
        const firecrawlPdf = await parsePdfWithFirecrawl({
          data: buf,
          fileName: meta.fileName,
          contentType: meta.contentType,
          mode: "ocr",
        });
        extractedText = firecrawlPdf.markdown;
        extractedMarkdown = firecrawlPdf.markdown;
      }
    }
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
        fatalError: redactErrorMessage(parsed.message),
        rows: [],
      };
    }

    const normalized = normalizeParserRows(parsed.rows);
    const rows = normalized.map((r) => ({
      rowIndex: r.rowIndex,
      rawSummary: r.rawSummary,
      normalizedDescription: r.normalizedDescription,
      normalizedCategory: r.normalizedCategory,
      normalizedIncurredDate: r.normalizedIncurredDate,
      normalizedAmountCents: r.normalizedAmountCents,
      normalizedType: r.normalizedType,
      confidence: r.confidence,
      rowError: r.rowError,
    }));

    return {
      parserId: choice.parserId,
      accountSuggestion: parsed.accountSuggestion,
      rows,
    };
  },
});
