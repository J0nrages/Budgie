"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convexClient =
  convexUrl !== undefined && convexUrl.length > 0
    ? new ConvexReactClient(convexUrl)
    : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convexClient) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
        <p className="font-medium text-destructive">
          Missing <code className="font-mono">NEXT_PUBLIC_CONVEX_URL</code>
        </p>
        <p className="mt-2 text-muted-foreground">
          Run <code className="font-mono">bunx convex dev</code> and ensure{" "}
          <code className="font-mono">.env.local</code> is present.
        </p>
      </div>
    );
  }

  return (
    <ConvexProvider client={convexClient}>{children}</ConvexProvider>
  );
}
