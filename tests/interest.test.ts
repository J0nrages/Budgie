import { describe, expect, it } from "vitest";
import { estimateInterest } from "@/lib/interest";

describe("interest", () => {
  it("returns null estimate when APR missing", () => {
    const r = estimateInterest({
      aprBps: 0,
      cycleStart: "2025-04-01",
      cycleEnd: "2025-04-30",
      method: "averageDailyBalance",
      dailyBalances: [{ date: "2025-04-01", endingBalanceCents: -100_000 }],
    });
    expect(r.ok).toBe(false);
    expect(r.estimatedInterestCents).toBeNull();
  });

  it("estimates interest from average daily balance", () => {
    const r = estimateInterest({
      aprBps: 2199,
      cycleStart: "2025-04-01",
      cycleEnd: "2025-04-30",
      method: "averageDailyBalance",
      dailyBalances: [
        { date: "2025-04-01", endingBalanceCents: -200_000 },
        { date: "2025-04-02", endingBalanceCents: -200_000 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.estimatedInterestCents).not.toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
