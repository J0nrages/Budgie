# Import pipeline

## Lifecycle

1. Client computes a SHA256 hash, then requests an upload URL (`statements.generateUploadUrl`).
2. Browser `POST`s the file to Convex storage.
3. Client records metadata via `statements.finalizeUploadedStatement`.
   - If the same SHA256 already exists, the upload is treated as a duplicate file and no workflow starts.
   - Otherwise, Convex creates a `statementFiles` row and `importJobs` row in `queued` status.
4. A **Convex Workflow** (`importWorkflow.importStatementWorkflow`) runs:
   - `markJobProcessing` — sets job + file to `processing`.
   - `parseStatementForImportJob` (action, retriable) — verifies the stored file hash, extracts text locally with `unpdf`, optionally falls back to Firecrawl OCR when extraction is insufficient, selects a parser, and normalizes rows.
   - `persistParseResults` (mutation) — **idempotent** upsert of `importRows` by `(importJobId, rowIndex)`, duplicate detection, and account suggestion persistence.
5. If the statement has no linked account, the job moves to `needsAccountLink` until the user confirms an existing account or creates a new one through `imports.linkImportJobToAccount`.
6. User reviews rows in the UI and calls `imports.acceptImportRow` / `imports.rejectImportRow`.

## Parser contract

See `src/lib/parsers/parser-types.ts`. Parsers return safe `ParserRow` objects (short `rawSummary`, never full sensitive lines in logs).

`chooseParser` in `registry.ts` picks implementation by MIME type / extension.

- CSV continues through the generic bank CSV parser.
- PDFs are issuer-detected first.
- Discover PDFs route to the dedicated Discover parser.
- Known but unsupported issuers fail with a targeted message rather than the old generic PDF placeholder error.

When OCR fallback is used, Firecrawl markdown is passed into the same parser contract as local text extraction.

## Duplicate keys

`buildTransactionDuplicateKey` (`convex/lib/ids.ts`, mirrored in `src/lib/duplicates.ts`) builds deterministic signatures from date + amount + description + posting account. Existing transactions with the same key mark a row as `duplicate`.

There are now two duplicate layers:

- **File duplicate protection**: `statementFiles.by_sha256` prevents the same uploaded PDF or CSV from spawning another import job.
- **Row / transaction duplicate protection**: deterministic transaction duplicate keys still mark individual rows as `duplicate`.

## Adding a bank CSV parser

1. Add a new parser function returning `ParserResult`.
2. Register it in `registry.ts` (prefer narrow detection rules to avoid accidental matches).
3. Add a sanitized fixture under `tests/fixtures/csv/` and extend normalization tests if column mappings are unusual.

## Idempotency rules

- Re-running `persistParseResults` patches existing rows with the same `rowIndex` instead of inserting duplicates.
- Accepting an import row twice returns the original transaction id when `acceptedTransactionId` is already set.
- Linking an import job to an account recomputes duplicate keys for all open rows using the confirmed account ID.
