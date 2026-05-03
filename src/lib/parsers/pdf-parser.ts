import { parseDiscoverStatement } from "./discover-statement";
import { detectIssuer } from "./issuer-detect";
import type { ParserFailure, ParserInput, ParserResult } from "./parser-types";

export function parsePdfStatement(input: ParserInput): ParserResult {
  const detection = detectIssuer(input);

  if (detection.issuer === "discover") {
    return parseDiscoverStatement(input);
  }

  const failure: ParserFailure = {
    ok: false,
    errorCode: "PDF_UNRECOGNIZED_ISSUER",
    message: detection.issuerName
      ? `Detected a ${detection.issuerName} statement, but only Discover PDF parsing is supported right now.`
      : "This PDF statement format is not recognized yet. Upload a CSV export or a supported Discover statement PDF.",
  };
  return failure;
}
