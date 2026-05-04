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
import { extractTextWithUnpdf } from "../src/lib/parsers/pdf-extract";
import { normalizeParserRows } from "../src/lib/statement-normalization";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Stable, user-actionable hint for the case where the local `unpdf` extractor
 * cannot run in the Convex V8 isolate (its bundled `pdf.js` calls
 * `structuredClone(value, { transfer })`, which V8 isolates do not implement)
 * and no OCR fallback is configured. Surfaced verbatim on the failed job in
 * the Imports panel.
 */
const PDF_LOCAL_PARSE_UNAVAILABLE_HINT =
  "Local PDF text extraction is not available in this Convex runtime. " +
  "Set FIRECRAWL_API_KEY in your Convex environment to enable OCR, " +
  "upload the statement as CSV instead, or move this action to the Convex " +
  "Node.js runtime (requires Node v18, 20, 22, or 24 installed).";

function hasEnoughExtractedPdfText(text: string, itemCount: number): boolean {
  const condensed = text.replace(/\s+/g, "");
  return condensed.length >= 200 && itemCount >= 20;
}

type LocalPdfExtraction = {
  text: string;
  itemCount: number;
  failure?: string;
};

async function tryUnpdfExtract(buf: ArrayBuffer): Promise<LocalPdfExtraction> {
  try {
    const result = await extractTextWithUnpdf(buf);
    return { text: result.text, itemCount: result.items.length };
  } catch (err) {
    return {
      text: "",
      itemCount: 0,
      failure: err instanceof Error ? err.message : String(err),
    };
  }
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
    try {
      const meta = await ctx.runQuery(
        internal.importWorkflowSteps.getJobContext,
        { importJobId: args.importJobId },
      );
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
        const localPdf = await tryUnpdfExtract(buf);
        extractedText = localPdf.text;

        const localFailed = localPdf.failure !== undefined;
        const localShort = !hasEnoughExtractedPdfText(
          localPdf.text,
          localPdf.itemCount,
        );

        if (localFailed || localShort) {
          if (process.env.FIRECRAWL_API_KEY) {
            try {
              const firecrawlPdf = await parsePdfWithFirecrawl({
                data: buf,
                fileName: meta.fileName,
                contentType: meta.contentType,
                mode: "ocr",
              });
              extractedText = firecrawlPdf.markdown;
              extractedMarkdown = firecrawlPdf.markdown;
            } catch (err) {
              const ocrMessage =
                err instanceof Error ? err.message : String(err);
              return {
                parserId: "unknown",
                accountSuggestion: undefined,
                fatalError: redactErrorMessage(
                  localFailed
                    ? `PDF text extraction failed (${localPdf.failure}); OCR fallback failed (${ocrMessage}).`
                    : `PDF text extraction returned too little text; OCR fallback failed (${ocrMessage}).`,
                ),
                rows: [],
              };
            }
          } else if (localFailed) {
            return {
              parserId: "unknown",
              accountSuggestion: undefined,
              fatalError: redactErrorMessage(
                `${PDF_LOCAL_PARSE_UNAVAILABLE_HINT} ` +
                  `Underlying error: ${localPdf.failure}`,
              ),
              rows: [],
            };
          }
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
        fatalError: redactErrorMessage(`Parser action crashed: ${message}`),
        rows: [],
      };
    }
  },
});
