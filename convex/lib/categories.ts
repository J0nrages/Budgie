/**
 * Normalize a free-form category string for matching and deduplication.
 * Lowercase, trim, collapse internal whitespace.
 */
export function normalizeCategoryKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
