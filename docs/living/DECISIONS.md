# DECISIONS

## 2026-10-08 One global auth gate instead of per-route middleware
Mounted once (`app.use('/api', apiAuthGate)`) so new routes are protected by default; public paths are an explicit allow-list in `middleware/auth.js`. Chosen over editing ~160 route definitions. Trade-off: a path-based allow-list must be kept in sync when public endpoints are added.

## 2026-10-08 No JWT fallback secret
Production fails fast at startup; development uses a random per-process secret. The previous default is public in git history and must be considered compromised.
