import type { InterestMethod } from "../types/finance";

export type DailyBalancePoint = { date: string; endingBalanceCents: number };

export type InterestEstimateInput = {
  aprBps: number;
  cycleStart: string;
  cycleEnd: string;
  method: InterestMethod;
  dailyBalances: DailyBalancePoint[];
};

export type InterestEstimateResult = {
  ok: boolean;
  estimatedInterestCents: number | null;
  dailyPeriodicRate: number;
  cycleDays: number;
  averageBalanceCents: number | null;
  assumptions: string[];
  warnings: string[];
};

function parseIso(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function daysInclusive(start: string, end: string): number {
  const a = Date.UTC(
    parseIso(start).y,
    parseIso(start).m - 1,
    parseIso(start).d,
  );
  const b = Date.UTC(parseIso(end).y, parseIso(end).m - 1, parseIso(end).d);
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

export function estimateInterest(
  input: InterestEstimateInput,
): InterestEstimateResult {
  const assumptions: string[] = [];
  const warnings: string[] = [];

  if (input.aprBps <= 0 || !Number.isFinite(input.aprBps)) {
    warnings.push("APR (basis points) is missing or invalid.");
    return {
      ok: false,
      estimatedInterestCents: null,
      dailyPeriodicRate: 0,
      cycleDays: 0,
      averageBalanceCents: null,
      assumptions,
      warnings,
    };
  }

  const apr = input.aprBps / 10000;
  const cycleDays = daysInclusive(input.cycleStart, input.cycleEnd);
  assumptions.push(
    `Treats APR ${input.aprBps} bps (${apr.toFixed(4)} nominal) as yearly simple rate.`,
  );
  assumptions.push(`Cycle length ${cycleDays} day(s) inclusive.`);

  const dailyPeriodicRate = apr / 365;

  if (input.dailyBalances.length === 0) {
    warnings.push("No daily balances supplied — cannot estimate interest.");
    return {
      ok: false,
      estimatedInterestCents: null,
      dailyPeriodicRate,
      cycleDays,
      averageBalanceCents: null,
      assumptions,
      warnings,
    };
  }

  let sum = 0;
  for (const p of input.dailyBalances) {
    sum += p.endingBalanceCents;
  }
  const averageBalanceCents = Math.round(sum / input.dailyBalances.length);

  if (input.method === "averageDailyBalance") {
    const raw = averageBalanceCents * dailyPeriodicRate * cycleDays;
    const cents = Math.round(raw);
    assumptions.push(
      "Uses average of provided daily ending balances × daily periodic rate × cycle days.",
    );
    warnings.push(
      "This is an estimate only — issuer rounding, grace periods, and promo rates are not modeled.",
    );
    return {
      ok: true,
      estimatedInterestCents: Math.max(0, cents),
      dailyPeriodicRate,
      cycleDays,
      averageBalanceCents,
      assumptions,
      warnings,
    };
  }

  warnings.push(`Interest method ${input.method} is not implemented in v1.`);
  return {
    ok: false,
    estimatedInterestCents: null,
    dailyPeriodicRate,
    cycleDays,
    averageBalanceCents,
    assumptions,
    warnings,
  };
}
