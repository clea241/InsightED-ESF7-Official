# DECISIONS

## 2026-10-08 One global auth gate instead of per-route middleware
Mounted once (`app.use('/api', apiAuthGate)`) so new routes are protected by default; public paths are an explicit allow-list in `middleware/auth.js`. Chosen over editing ~160 route definitions. Trade-off: a path-based allow-list must be kept in sync when public endpoints are added.

## 2026-10-08 No JWT fallback secret
Production fails fast at startup; development uses a random per-process secret. The previous default is public in git history and must be considered compromised.

## 2026-10-09 Dedupe by stable key, keep the original
Duplicates are collapsed on id (or grade+section name for sections, prn for personnel); the first/oldest copy keeps its identity and later copies only fill its empty fields. Chosen over "newest wins" so ids that other records point at never change. Client and server each carry an identical copy of the helper because no shared layer exists yet.
