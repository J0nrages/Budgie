# Budgeter

Next.js + Convex personal finance app with durable statement import workflows, reviewable import rows, cash/accrual ledger views, and credit-card oriented modeling.

## Security warning

**There is no authentication in v1.** Run this only on your own machine or behind a private network. Uploaded statements are sensitive — do not deploy publicly until you add auth and per-user authorization.

## Prerequisites

- [Bun](https://bun.sh) (preferred) or `pnpm` / `npm` as fallback
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

Then:

```bash
bunx convex dev    # keep running while developing — regenerates types
bun run dev        # Next.js with Turbopack
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

## Package manager fallback

Prefer Bun (`bun`, `bunx`). If a tool fails under Bun, try `pnpm` / `pnpm dlx`, then npm only as a last resort — document any workaround in a PR.

## Data model overview

See `docs/architecture.md` and `convex/schema.ts`. Canonical `transactions` are separate from parser output (`importRows`), which must be explicitly accepted after review.

The import pipeline now supports:

- CSV statements
- Discover credit-card PDFs
- Duplicate-file rejection via SHA256 before a workflow starts
- Account suggestion + confirmation when a parsed statement is not already linked to an account

## Tests & fixtures

- Unit tests: `bun run test`
- Safe CSV sample: `tests/fixtures/csv/sample-bank.csv`
- PDF fixtures: see `tests/fixtures/pdf/README.md`
