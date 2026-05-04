/** Deterministic merchant key (mirrors src/lib/merchant-normalize.ts for Convex). */
export function normalizedMerchantKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}
