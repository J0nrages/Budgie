# Import pipeline

## Lifecycle

1. Client computes a SHA256 hash, then requests an upload URL (`statements.generateUploadUrl`).
   - The main toolbar and Imports panel both support selecting multiple files.
   - `useImportFileUpload` processes files with capped concurrency (`3`) and records per-file outcomes.
   - Client guards reject empty files, files over 10 MiB, and PDF files whose leading bytes do not look like `%PDF`.
2. Browser `POST`s the file to Convex storage.
3. Client records metadata via `statements.finalizeUploadedStatement`.
   - If the same SHA256 already exists, the upload is treated as a duplicate file and no workflow starts.
   - Otherwise, Convex creates a `statementFiles` row and `importJobs` row in `queued` status.
4. A **Convex Workflow** (`importWorkflow.importStatementWorkflow`) runs:
   - `markJobProcessing` — sets job + file to `processing`.
   - `parseStatementForImportJob` (action, retriable) — enforces the 10 MiB size guard, verifies the stored file hash, parses PDFs with Firecrawl `/parse` when `FIRECRAWL_API_KEY` is configured, selects a parser, normalizes rows, and returns the full normalized row payload. Any unexpected error is caught and returned as `fatalError` so the workflow always reaches `persistParseResults` (no permanently stuck `processing` jobs).
   - `persistParseResults` (mutation) — **idempotent** upsert of `importRows` by `(importJobId, rowIndex)`, duplicate detection, account suggestion persistence, and reconciliation sync. When `fatalError` is set the job + file are marked `failed` with a redacted error message.
   - Progress is stored on `importJobs` (`progressStage`, `progressMessage`, `progressPercent`) so the Imports UI updates live over the existing Convex subscription.
5. If the statement has no linked account, the job moves to `needsAccountLink` until the user confirms an existing account or creates a new one through `imports.linkImportJobToAccount`.
6. User reviews rows in the UI and calls `imports.acceptImportRow` / `imports.rejectImportRow`.

## PDF parsing

PDF imports use Firecrawl's `/parse` endpoint because local PDF extraction is not reliable in the Convex V8 isolate runtime. `FIRECRAWL_API_KEY` must be configured in the Convex environment for PDF imports.

CSV imports are unaffected and continue to parse locally.

## Retrying a job

`imports.retryImportJob` cancels and cleans up the previous workflow, deletes any non-accepted rows, resets job + file status to `queued`, and starts a fresh workflow. The Imports panel exposes a **Retry parsing** button on jobs in `failed`, `processing`, or `queued` status. Accepted rows are preserved so we never silently destroy ledger transactions the user already promoted.

## Stored evidence

`importRows` preserve parser evidence separately from canonical ledger transactions. The current row shape includes:

- Safe `rawSummary` and normalized review fields.
- Distinct transaction/post dates when the source exposes both.
- Merchant/payee, memo, category, FITID/bank transaction id, reference number, check number, currency, posting status, and row running balance when extractable.
- Parser confidence and row-level `redactedError` for rows that cannot be normalized.

Accepted rows promote those same fields to `transactions` while retaining `sourceImportRowId` and `sourceStatementFileId` for traceability.

## Parser contract

See `src/lib/parsers/parser-types.ts`. Parsers return safe `ParserRow` objects (short `rawSummary`, never full sensitive lines in logs).

`chooseParser` in `registry.ts` picks implementation by MIME type / extension.

- CSV continues through the generic bank CSV parser.
- PDFs are issuer-detected first.
- Discover PDFs route to the dedicated Discover parser.
- Known but unsupported issuers fail with a targeted message rather than the old generic PDF placeholder error.

For PDFs, Firecrawl markdown is passed into the same parser contract as CSV text extraction.

Generic CSV header matching recognizes common transaction date, post date, balance, merchant/payee, memo, FITID/id, reference, check, currency, and pending/posted columns. Debit/credit columns are normalized into positive review amounts plus transaction type.

## Duplicate keys

`buildTransactionDuplicateKey` (`convex/lib/ids.ts`, mirrored in `src/lib/duplicates.ts`) builds deterministic signatures from date + amount + description + posting account. Existing transactions with the same key mark a row as `duplicate`.

There are now two duplicate layers:

- **File duplicate protection**: `statementFiles.by_sha256` prevents the same uploaded PDF or CSV from spawning another import job.
- **Row / transaction duplicate protection**: deterministic transaction duplicate keys still mark individual rows as `duplicate`.
- **Bank id duplicate protection**: when a parser supplies `bankTransactionId`, imports also check `transactions.by_bank_transaction_id` and in-file repeated bank ids for the same account.

If composite duplicate detection and bank-id detection point at different existing transactions, accepting the row fails with a conflict. If either path finds an existing transaction, the row is treated as duplicate unless the reviewer intentionally forces acceptance.

## Reconciliation

`statementFiles` and `importJobs` carry `reconciliationStatus`, `provisionalReason`, and `reconciliationDetail`.

- If opening or closing statement balances are absent, the job is `provisional`.
- If the job is not linked to an account, reconciliation is also `provisional`.
- If opening/closing balances are available, imported row effects are summed using account type semantics:
  - asset expenses/fees/interest reduce balance; income/payment increase it
  - liability expenses/fees/interest increase amount owed; payments/income reduce it
- A one-cent tolerance is considered `matched`; otherwise the job is `mismatch` and records the expected vs statement closing balance detail.

Current parsers preserve row-level balances when extractable. Statement-level opening/closing fields are schema-backed and reconciliation-ready, but imports without those source balances remain provisional instead of blocking review.

## Merchant normalization

Phase A merchant normalization is deterministic and local:

- `merchants` stores canonical merchant names and normalized keys.
- `merchantAliases` maps normalized alias patterns to merchant ids.
- The Imports UI can create merchants and save aliases.
- `acceptImportRow` resolves `merchantId` from the row's normalized merchant value or exact normalized alias key.

There are no LLM calls in the import or accept path.

### Merchant logos (Logo.dev)

- Logos use **curated** merchant fields only: `merchants.canonicalName` and optional `merchants.logoDomain` (hostname for Logo.dev domain lookup, e.g. `wholefoodsmarket.com`).
- Do not use raw import descriptions or noisy `importRows` payee text as the primary Logo.dev identifier; the name endpoint resolves the first brand-search hit and is less reliable than domain lookup.
- Set `NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY` in `.env.local` (see `.env.example`); Logo.dev documents this publishable token for browser `<img src="https://img.logo.dev/...">` URLs.
- Phase A `normalizedKey` and `merchantAliases` are unchanged: they exist for dedupe and import matching, not for logo identity.

## Adding a bank CSV parser

1. Add a new parser function returning `ParserResult`.
2. Register it in `registry.ts` (prefer narrow detection rules to avoid accidental matches).
3. Add a sanitized fixture under `tests/fixtures/csv/` and extend normalization tests if column mappings are unusual.
4. Preserve bank-native metadata in `ParserRow` rather than collapsing everything into description/date/amount.

## Idempotency rules

- Re-running `persistParseResults` patches existing rows with the same `rowIndex` instead of inserting duplicates.
- Accepting an import row twice returns the original transaction id when `acceptedTransactionId` is already set.
- Linking an import job to an account recomputes duplicate keys for all open rows using the confirmed account ID.
- Reconciliation is recomputed after parsing and after account linking.
