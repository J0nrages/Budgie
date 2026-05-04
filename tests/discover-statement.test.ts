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

  it("parses Firecrawl-style Markdown tables", () => {
    const result = parseDiscoverStatement({
      fileName: "discover.pdf",
      contentType: "application/pdf",
      sizeBytes: discoverFixture.length,
      markdown: `
Discover Card
Account Number Ending In 1234
Statement Period: 12/14/25 - 01/13/26

Payments and Credits

| Post Date | Description | Amount |
| --- | --- | --- |
| 12/28 | AUTOPAY PAYMENT THANK YOU | \\$150.00 CR |

Purchases

| Trans Date | Post Date | Description | Amount |
| --- | --- | --- | --- |
| 01/02 | 01/03 | WHOLE FOODS MARKET | \\$45.67 |
`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      postedDate: "2025-12-28",
      description: "AUTOPAY PAYMENT THANK YOU",
      amountCents: -15000,
    });
    expect(result.rows[1]).toMatchObject({
      transactionDate: "2026-01-02",
      postedDate: "2026-01-03",
      description: "WHOLE FOODS MARKET",
      amountCents: 4567,
    });
  });

  it("parses month-name dates from extracted PDFs", () => {
    const result = parseDiscoverStatement({
      fileName: "discover.pdf",
      contentType: "application/pdf",
      sizeBytes: discoverFixture.length,
      markdown: `
Discover Card
Account Number Ending In 1234
Statement Period: December 14, 2025 - January 13, 2026

Payments and Credits
Dec 27 Dec 28 AUTOPAY PAYMENT THANK YOU $150.00 CR

Purchases
Jan 02 Jan 03 WHOLE FOODS MARKET $45.67
`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      postedDate: "2025-12-28",
      amountCents: -15000,
    });
    expect(result.rows[1]).toMatchObject({
      transactionDate: "2026-01-02",
      postedDate: "2026-01-03",
      amountCents: 4567,
    });
  });
});
