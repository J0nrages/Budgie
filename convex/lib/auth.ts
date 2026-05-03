/**
 * Single-user local development guard.
 *
 * Authentication is intentionally deferred. Public Convex functions call this so
 * adding `userId` / workspace ownership checks later is a localized change.
 */
export function assertSingleUserLocalMode(): void {
  // No-op for v1 local-only mode.
}
