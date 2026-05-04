# Security

## Current posture (v1)

- **No authentication** — anyone who can reach the deployment can read/write data.
- **Sensitive uploads** — CSV/PDF statements may contain account identifiers and transaction detail.
- **Logs** — parser and workflow code must not log raw file contents (see `convex/lib/redaction.ts`).
- **PDF parsing egress** — PDFs are sent to Firecrawl `/parse` when `FIRECRAWL_API_KEY` is configured.

## Local development

- Keep `.env.local` private; rotate Convex keys if leaked.
- Prefer running Convex against a personal dev deployment, not shared demo teams.
- Treat `FIRECRAWL_API_KEY` as sensitive.
- Statement PDFs are parsed through Firecrawl; CSV imports remain local.

## Before any public deployment

1. Add auth (Clerk, Convex Auth, etc.) and **per-user** (or per-workspace) ownership on every table.
2. Lock down Convex functions — reject unauthenticated callers.
3. Review file storage policies — signed URLs, retention, encryption expectations.
4. Add rate limiting / abuse protections on uploads.
5. If using Firecrawl in production, review their retention posture and request Zero Data Retention if required for your threat model.

## Redaction

User-visible errors should flow through `redactErrorMessage` so paths, hashes, and overly long strings are not persisted verbatim.
