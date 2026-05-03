import { describe, expect, it } from "vitest";
import { buildDuplicateKey, duplicateConfidence } from "@/lib/duplicates";

describe("duplicates", () => {
  it("builds stable keys", () => {
    const k = buildDuplicateKey({
      incurredDate: "2025-01-02",
      amountCents: 100,
      description: "Coffee",
      accountKey: "acct_1",
    });
    expect(k).toContain("2025-01-02");
    expect(k).toContain("100");
    expect(k.toLowerCase()).toContain("coffee");
  });

  it("scores exact matches", () => {
    const k = buildDuplicateKey({
      incurredDate: "2025-01-02",
      amountCents: 100,
      description: "Coffee",
      accountKey: "a",
    });
    expect(duplicateConfidence(k, k)).toBe(1);
  });
});
