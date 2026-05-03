import type { ParserInput, ParserResult } from "./parser-types";
import { parseBankCsv } from "./csv-parser";
import { detectIssuer } from "./issuer-detect";
import { parsePdfStatement } from "./pdf-parser";

function pdfParserId(input: ParserInput): string {
  const detection = detectIssuer(input);
  switch (detection.issuer) {
    case "discover":
      return "discover-pdf-v1";
    case "chase":
      return "chase-pdf-unsupported-v1";
    case "americanExpress":
      return "american-express-pdf-unsupported-v1";
    default:
      return "pdf-unsupported-v1";
  }
}

export function chooseParser(input: ParserInput): {
  parserId: string;
  run: (input: ParserInput) => ParserResult;
} {
  const ct = input.contentType.toLowerCase();
  const name = input.fileName.toLowerCase();

  if (ct.includes("csv") || name.endsWith(".csv")) {
    return { parserId: "generic-csv-v1", run: parseBankCsv };
  }

  if (ct.includes("pdf") || name.endsWith(".pdf")) {
    return { parserId: pdfParserId(input), run: parsePdfStatement };
  }

  return {
    parserId: "unknown",
    run: (): ParserResult => ({
      ok: false,
      errorCode: "UNSUPPORTED_TYPE",
      message:
        "Unsupported file type. Upload a CSV export or a supported statement format.",
    }),
  };
}
