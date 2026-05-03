import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDiscoverStatement } from "@/lib/parsers/discover-statement";

const discoverFixture = readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/pdf/discover-sample.txt"),
  "utf8",
);

describe("discover-statement", () => {
  it("parses payments and purchases with inferred years", () => {
    const result = parseDiscoverStatement({
      fileName: "discover.pdf",
      contentType: "application/pdf",
      sizeBytes: discoverFixture.length,
      text: discoverFixture,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]).toMatchObject({
      rowIndex: 0,
      postedDate: "2025-12-28",
      description: "AUTOPAY PAYMENT THANK YOU",
      amountCents: -15000,
      category: "Payments and credits",
    });
    expect(result.rows[2]).toMatchObject({
      rowIndex: 2,
      postedDate: "2026-01-03",
      description: "WHOLE FOODS MARKET",
      amountCents: 4567,
      category: "Purchases",
    });
    expect(result.accountSuggestion?.statementPeriodEnd).toBe("2026-01-13");
  });
});
