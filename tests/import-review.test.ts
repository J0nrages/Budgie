import { describe, expect, it } from "vitest";
import { buildAccountMetadataWarnings } from "../convex/lib/importReview";
import {
  buildSuggestedAccountDraft,
  summarizeImportRows,
} from "@/lib/import-review";

describe("import review helpers", () => {
  it("auto-apply summary only triggers for mixed imports", () => {
    expect(
      summarizeImportRows([{ status: "needsReview" }, { status: "error" }])
        .shouldAutoApplyReadyRows,
    ).toBe(true);
    expect(
      summarizeImportRows([{ status: "needsReview" }, { status: "needsReview" }])
        .shouldAutoApplyReadyRows,
    ).toBe(false);
  });

  it("builds liability defaults for discover statements", () => {
    expect(
      buildSuggestedAccountDraft({ issuer: "Discover", lastFour: "1234" }),
    ).toEqual({
      name: "Discover 1234",
      type: "liability",
      subtype: "creditCard",
    });
  });

  it("surfaces explicit account metadata conflicts as warnings", () => {
    const warnings = buildAccountMetadataWarnings(
      {
        name: "Primary card",
        issuer: "Chase",
        institution: "Chase",
        lastFour: "9999",
        creditLimitCents: 100_000,
        aprBps: 1999,
        statementDay: 2,
        paymentDueDay: 24,
      },
      {
        issuer: "Discover",
        institution: "Discover Bank",
        lastFour: "1234",
        creditLimitCents: 120_000,
        aprBps: 2499,
        statementDay: 10,
        paymentDueDay: 28,
      },
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        "Statement issuer Discover differs from account issuer Chase.",
        "Statement last four 1234 differs from account last four 9999.",
        "Statement credit limit differs from the existing account.",
        "Statement APR differs from the existing account.",
      ]),
    );
  });
});
