# Budgeter

Next.js + Convex personal finance app with durable statement import workflows, audit-friendly import review, cash/accrual/projected ledger views, indexed report queries, and credit-card oriented modeling.

## Security warning

**There is no authentication in v1.** Run this only on your own machine or behind a private network. Uploaded statements are sensitive — do not deploy publicly until you add auth and per-user authorization.

## Prerequisites

- [Bun](https://bun.sh) — install and scripts are **Bun only** (`bun`, `bun run`, `bunx`)
- **Node.js 24 LTS** on your `PATH` while developing: the `next` CLI is executed with `node`, so run `nvm use` in this repo first (see `.nvmrc`) if you use [nvm](https://github.com/nvm-sh/nvm)
- A [Convex](https://convex.dev) project (anonymous agent mode works for codegen)

## Setup

```bash
bun install
```

Create `.env.local` with your Convex deployment URL (from `bunx convex dev`):

```
NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
```

Optional for scanned PDFs only:

```
FIRECRAWL_API_KEY=fc-...
```

Digital statement PDFs (for example Discover exports) are parsed locally first. `FIRECRAWL_API_KEY` is only used as an OCR fallback when local PDF extraction returns too little text.

Then (with Node 24 active, e.g. `nvm use`):

```bash
bunx convex dev    # keep running while developing — regenerates types
bun run dev        # Next.js with Turbopack (same as `next dev --turbopack` via package.json)
```

### Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Next.js dev server |
| `bun run convex:dev` | Convex dev / codegen |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Vitest |
| `bun run build` | Production build |

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind + **shadcn/ui**
- **Convex** database, file storage, queries/mutations, and **Convex Workflow** for imports
- **Hybrid PDF parsing**: local `unpdf` first, optional Firecrawl OCR fallback for scanned PDFs
- Money stored as **integer cents**; dates as **`YYYY-MM-DD`** strings

## Tooling

Use Bun only for installs and project scripts. If a dependency or upstream tool genuinely breaks under Bun, document the exception in the PR; do not treat `npm` / `pnpm` as the default path.

## Data model overview

See `docs/architecture.md` and `convex/schema.ts`. Canonical `transactions` are separate from parser output (`importRows`), which must be explicitly accepted after review.

The import pipeline now supports:

- CSV statements
- Discover credit-card PDFs
- Duplicate-file rejection via SHA256 before a workflow starts
- Account suggestion + confirmation when a parsed statement is not already linked to an account
- Multi-file upload with capped client concurrency and per-file outcomes
- Bank-native metadata preservation on import rows and accepted transactions, including merchant, memo, bank transaction id, reference/check numbers, posting status, and source balances when parsers can extract them
- Statement reconciliation states (`provisional`, `matched`, `mismatch`) on statement files and import jobs
- Deterministic merchant normalization with canonical merchants and alias patterns

Persistence is Convex-only:

- File bytes are stored in Convex storage.
- `statementFiles`, `importJobs`, and `importRows` preserve import evidence and workflow state.
- `transactions` are canonical ledger entries created only when a review row is accepted.
- `merchants` and `merchantAliases` support deterministic Phase A merchant normalization.

## Reporting and ledger behavior

- Posted ledger behavior is unchanged: cash basis includes only cleared transactions, accrual includes incurred transactions.
- Projected cash ledger can include uncleared/pending transactions for account-level cash-flow previews.
- `convex/reports.ts` exposes indexed category and merchant totals over explicit date ranges. Queries do not call `Date.now()`; callers pass dates.
- Duplicate detection uses both the existing composite transaction signature and optional bank transaction ids. A bank id collision is treated as a duplicate unless intentionally forced during review.

## Tests & fixtures

- Unit tests: `bun run test`
- Safe CSV sample: `tests/fixtures/csv/sample-bank.csv`
- PDF fixtures: see `tests/fixtures/pdf/README.md`
- Reconciliation and projected-ledger behavior are covered by Vitest unit tests.
