/** Deterministic merchant key for dedupe and alias matching (Phase A). */
export function normalizedMerchantKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}
