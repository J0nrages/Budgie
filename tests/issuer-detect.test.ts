import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectIssuer } from "@/lib/parsers/issuer-detect";

const discoverFixture = readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/pdf/discover-sample.txt"),
  "utf8",
);
const chaseFixture = readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/pdf/chase-sample.txt"),
  "utf8",
);

describe("issuer-detect", () => {
  it("extracts a Discover account suggestion", () => {
    const detection = detectIssuer({ text: discoverFixture });

    expect(detection.issuer).toBe("discover");
    expect(detection.issuerName).toBe("Discover");
    expect(detection.accountSuggestion).toEqual({
      issuer: "Discover",
      lastFour: "1234",
      institution: "Discover",
      creditLimitCents: 1100000,
      statementDay: 13,
      paymentDueDay: 8,
      aprBps: 2424,
      statementPeriodStart: "2025-12-14",
      statementPeriodEnd: "2026-01-13",
    });
  });

  it("detects Chase without treating it as Discover", () => {
    const detection = detectIssuer({ text: chaseFixture });

    expect(detection.issuer).toBe("chase");
    expect(detection.issuerName).toBe("Chase");
    expect(detection.accountSuggestion?.lastFour).toBe("9999");
  });
});
