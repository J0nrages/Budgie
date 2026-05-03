import { describe, expect, it } from "vitest";
import { normalizeParserRows } from "@/lib/statement-normalization";
import type { ParserRow } from "@/lib/parsers/parser-types";

describe("statement-normalization", () => {
  it("maps signed amounts to income/expense types", () => {
    const rows: ParserRow[] = [
      {
        rowIndex: 0,
        rawSummary: "x",
        postedDate: "2025-01-02",
        description: "Charge",
        amountCents: 2500,
      },
      {
        rowIndex: 1,
        rawSummary: "y",
        postedDate: "2025-01-03",
        description: "Refund",
        amountCents: -900,
      },
    ];
    const n = normalizeParserRows(rows);
    expect(n[0].normalizedType).toBe("expense");
    expect(n[1].normalizedType).toBe("income");
    expect(n[0].normalizedAmountCents).toBe(2500);
    expect(n[1].normalizedAmountCents).toBe(900);
  });
});
