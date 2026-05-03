const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(label: string, value: string): void {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${label} must be an ISO date (YYYY-MM-DD)`);
  }
}
