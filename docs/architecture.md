# Architecture

## Overview

Budgeter is a single-page style dashboard composed from Next.js client components that talk directly to Convex queries and mutations. Shared accounting logic lives under `src/lib/*` with **no** imports from React or Convex so it can move into a future mobile package.

```text
Browser (Next.js) ──► Convex queries/mutations ──► Convex database + file storage
                         │
                         └──► Convex Workflow ──► import actions (parse) + idempotent mutations (persist rows)
```

## Why Convex + Workflows?

- **Realtime UI** — account balances and import job status update live.
- **File storage** — statements upload to Convex storage; workflows pull bytes in actions.
- **Durable imports** — retries-safe orchestration without half-written transactions; canonical postings happen only when users accept rows.
- **Future mobile** — Expo can reuse the same Convex API and shared `src/lib` modules.

## Modules

| Area | Location |
| --- | --- |
| Schema & API | `convex/*.ts` |
| Import orchestration | `convex/importWorkflow.ts`, `convex/importActions.ts`, `convex/importWorkflowSteps.ts` |
| Shared finance math | `src/lib/ledger.ts`, `money.ts`, `interest.ts`, `duplicates.ts`, `dates.ts` |
| Parsers | `src/lib/parsers/*`, `src/lib/statement-normalization.ts` |
| UI | `src/components/**`, `src/app/finance-app.tsx` |

## Auth roadmap

All public Convex functions currently assume **single-user local mode** (`assertSingleUserLocalMode` in `convex/lib/auth.ts`). Adding auth means threading `userId`/`workspaceId` through tables and enforcing ownership in every query/mutation.
