# Mobile & Plaid roadmap

## Near-term

1. Extract `src/lib/{money,dates,ledger,interest,duplicates}.ts` into a workspace package (e.g. `@budgeter/finance-core`).
2. Keep Convex as the system of record — an Expo app would use `convex/react-native` with the same deployment.

## Plaid integration (later)

1. Add OAuth link flow + Plaid access tokens stored securely (never in client bundles).
2. Model Plaid items + accounts mapped to internal `accounts` rows.
3. Scheduled Convex jobs / workflows to pull transactions and funnel them through the same normalization + review pipeline (likely skipping manual CSV upload).

## OCR / PDF extraction

Heavy OCR or bespoke PDF parsers may eventually move to isolated workers or third-party APIs; keep parser interfaces stable so only `registry.ts` and adapters change.
