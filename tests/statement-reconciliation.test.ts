import { describe, expect, it } from "vitest";
import { signedImportRowEffectOnBalance } from "convex/lib/statementReconciliation";

describe("statement reconciliation", () => {
  it("asset checking: expense reduces balance", () => {
    expect(
      signedImportRowEffectOnBalance("expense", 1000, "asset"),
    ).toBe(-1000);
  });

  it("liability card: expense increases amount owed", () => {
    expect(
      signedImportRowEffectOnBalance("expense", 1000, "liability"),
    ).toBe(1000);
  });

  it("asset: payment increases cash", () => {
    expect(signedImportRowEffectOnBalance("payment", 500, "asset")).toBe(500);
  });

  it("liability: payment reduces debt", () => {
    expect(signedImportRowEffectOnBalance("payment", 500, "liability")).toBe(-500);
  });

  it("transfer ignored for statement sum", () => {
    expect(signedImportRowEffectOnBalance("transfer", 999, "asset")).toBe(0);
  });
});
