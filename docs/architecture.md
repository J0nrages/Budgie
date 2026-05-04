# Architecture

## Overview

Budgie is a single-page style dashboard composed from Next.js client components that talk directly to Convex queries and mutations. Convex is the only persistence layer: file bytes live in Convex storage, metadata and ledger data live in Convex tables, and there is no separate ORM.

Shared accounting and parser-normalization logic lives under `src/lib/*` with **no** imports from React or Convex so it can move into a future mobile package.

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
| Reconciliation / workflow helpers | `convex/lib/statementReconciliation.ts`, `convex/lib/ids.ts`, `convex/lib/workflow.ts` |
| Reports | `convex/reports.ts` |
| Merchant normalization | `convex/merchants.ts`, `convex/lib/merchantKey.ts`, `src/lib/merchant-normalize.ts` |
| Shared finance math | `src/lib/ledger.ts`, `money.ts`, `interest.ts`, `duplicates.ts`, `dates.ts` |
| Parsers | `src/lib/parsers/*`, `src/lib/statement-normalization.ts` |
| UI | `src/components/**`, `src/app/finance-app.tsx` |

## Data model

The core tables in `convex/schema.ts` are intentionally split between source evidence and canonical ledger data:

- `statementFiles` stores uploaded file metadata, SHA256, status, optional statement balances, and reconciliation state.
- `importJobs` tracks one workflow per uploaded statement and mirrors row counts, parser choice, account suggestion, and reconciliation state for the UI.
- `importRows` stores reviewable parser output. Rows keep bank-native metadata such as original description, memo, merchant, transaction/post dates, bank transaction id, reference/check numbers, currency, posting status, imported row balance, confidence, and row errors.
- `transactions` are the canonical ledger entries. They are created only by explicit user review/acceptance or manual transaction creation. Accepted imports promote audit fields and retain `sourceImportRowId` / `sourceStatementFileId`.
- `merchants` and `merchantAliases` support deterministic Phase A merchant normalization. Import acceptance resolves a `merchantId` by normalized merchant key or exact normalized alias pattern.
- `accounts` and `lenderProfiles` model assets/liabilities and credit-card oriented details such as limits, APR, statement day, and due day.

Indexes are defined for the hot paths: account/date ledgers, duplicate keys, source traceability, bank transaction id lookup, merchant/category/date reports, pending match keys, import job rows, accepted import rows, account lookup, and reconciliation status.

## Imports and reconciliation

Uploads follow a single-shot Convex storage flow: hash locally, generate an upload URL, POST bytes, then call `statements.finalizeUploadedStatement`. The client supports multi-file selection with capped concurrency and per-file outcomes. Each non-duplicate file creates one `statementFiles` row, one `importJobs` row, and one workflow.

`importStatementWorkflow` keeps workflow arguments small by passing only `importJobId`. Parser actions load bytes from Convex storage, verify SHA256, extract local PDF text with `unpdf`, optionally use Firecrawl OCR, choose a parser, then normalize rows. `persistParseResults` idempotently upserts rows by `(importJobId, rowIndex)`.

Reconciliation runs after parsing and account linking:

- Missing statement opening/closing balances or missing account link produce `provisional`.
- Available balances are checked against summed row effects using account type semantics.
- Matching balances become `matched`; mismatches record expected/actual closing detail.

Imports without source balances remain reviewable; reconciliation status is surfaced as an audit signal rather than a hard blocker.

## Duplicate policy

Duplicate detection has two independent paths:

- Composite duplicate key from incurred date, amount, normalized description, and posting account.
- Optional bank transaction id (`bankTransactionId`) when the source exposes one.

Rows can be marked duplicate by in-file collisions or existing transaction collisions. On acceptance, a collision must be forced intentionally. If composite and bank-id lookups point at different existing transactions, acceptance fails rather than silently merging unlike rows.

## Ledger and reports

`src/lib/ledger.ts` is still the source for ledger math:

- `buildAccountLedger` preserves posted behavior. Cash basis requires `isCleared` and `clearedDate`; accrual uses `incurredDate`.
- `buildAccountLedgerProjected` adds a cash-flow projection that includes uncleared rows using `incurredDate`, while still using cleared dates for cleared rows.
- `netWorthCents` and `sumIncomeExpense` continue to use posted ledger semantics.

`convex/reports.ts` exposes report queries over explicit date ranges:

- `categoryTotalsInRange`
- `merchantTotalsInRange`

Both use indexed transaction date lookups (`by_account_incurred` or `by_incurredDate`) and require callers to pass dates rather than using wall-clock time inside queries.

## UI shape

`src/app/finance-app.tsx` has three tabs:

- **Ledger**: transaction/account filtering, posted vs projected account ledger toggle on cash basis, audit fields such as merchant display.
- **Accounts**: account list and editing.
- **Imports**: statement upload, recent jobs, account link prompt, reconciliation status, review table, row edit sheet, and Phase A merchant/alias tools.

The toolbar upload button also supports multi-file upload and uses the currently selected ledger account as the optional linked account.

## Auth roadmap

All public Convex functions currently assume **single-user local mode** (`assertSingleUserLocalMode` in `convex/lib/auth.ts`). Adding auth means threading `userId`/`workspaceId` through tables and enforcing ownership in every query/mutation. Import storage, merchant aliases, report queries, and source-linked transactions would all need ownership checks before any public deployment.

## Verification

Use Bun as the canonical toolchain:

```bash
bunx convex codegen
bun run lint
bun run typecheck
bun run test
```

Current Vitest coverage includes parser behavior, file hash deduplication, duplicate key helpers, interest math, posted/projected ledger behavior, and statement reconciliation balance effects.
