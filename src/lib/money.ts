/**
 * Money helpers — integer cents only.
 */

export function formatUsd(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const frac = abs % 100;
  const core = `${dollars.toLocaleString("en-US")}.${frac.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}$${core}`;
}

export function parseUsdToCents(raw: string): number | null {
  const s = raw.trim().replace(/[$,]/g, "");
  if (s.length === 0) return null;
  const negative = s.startsWith("(") && s.endsWith(")");
  const n = Number.parseFloat(negative ? s.slice(1, -1) : s);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

export function absCents(cents: number): number {
  return Math.abs(cents);
}
