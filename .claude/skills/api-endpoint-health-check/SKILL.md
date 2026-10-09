---
name: api-endpoint-health-check
description: Postman/Newman-style health check for a Node/Express backend. Finds every HTTP endpoint from the source, calls each one safely, and reports which return 5xx, malformed data, leaked internals, missing auth, slow or hanging responses, plus which database tables each endpoint reads and writes. Use when asked to "check all endpoints", "are my APIs healthy", "test the routes", "smoke test the backend", "Postman-style check", "find endpoints that throw 500", "make sure none of my routes return 500", or "run a health check on the API", and after changes to routes, controllers, middleware or error-handling code. Non-destructive by default (loopback and allowlisted DB only). Does not audit where data is stored; that is draft-normalization-audit.
---

# API Endpoint Health Check

**Default mode is non-destructive.** Read-only on code and DB; only GET/HEAD/OPTIONS, no-auth, bad-input and *invalid-payload* writer probes are sent. Valid writes need `--include-writes` AND an explicit instruction in the user's current request. Never fix code unless the user asks after seeing the report. Hard rules and severities: read `rules.md` first.

Project values (base URL, auth, DB allowlist, thresholds, skip list) live in `endpoint-health.config.json`. If it does not exist the scripts fall back to `endpoint-health.config.example.json` (eSF7 defaults). For another project, copy the example and edit it; never edit the scripts for project values.

Scripts write to `$TMP/api-endpoint-health-check/` (override with `--out`), so the repo stays clean. Run them instead of rewriting them. All paths below are relative to this skill folder.

## Pipeline

1. **Discover.** `node scripts/discover_routes.js` -> `endpoints.manifest.json` (method, full path, params, auth, middleware, handler file:line, second independent count, OpenAPI/Postman cross-check). Read `reference/discovery.md` if it reports unresolved mounts or dynamic paths, then complete the manifest by hand and note it.
2. **Map tables.** `node scripts/map_tables.js` fills `tablesRead`, `tablesWritten`, `tableMappingConfidence` and checks every name against the live schema. Read `reference/db-table-mapping.md` for partial/unresolved cases and resolve what you can by reading the code.
3. **Auth.** The runner logs in with `HC_IDENTIFIER` / `HC_PASSWORD` from the environment (names set in config). Read `reference/auth-detection.md` to confirm the scheme from the middleware. No credentials: public endpoints and the 401/403 gate check only; say so. Never create accounts, never print tokens.
4. **Probe.** `node scripts/run_probes.js` (add `--start-server` to launch the app on a spare port and capture its logs). It refuses non-loopback URLs and non-allowlisted DB names before sending anything. Probe types and expected results: `reference/probes.md`. Choose sample ids and queries through config `sampleParams` / `queryDefaults`.
5. **Interpret.** Failures are your job: open the handler at the cited file:line, decide root cause, false alarm or real bug, and recommend a fix.
6. **Render.** `node scripts/render_report.js` -> `endpoint-health-report.md`. Format: `reference/report-template.md`. Show the report in chat; if over ~100 lines also give the saved path.

Recommend a database backup before the first run against a database that holds data you care about: invalid-payload probes can reach handlers that validate poorly (this skill's first run created two junk rows that way).

## Before returning the report

Check with real evidence (command output), not by rereading your own text:
- The report's endpoint count equals the manifest; the manifest agrees with the second independent count (`countCheck` in the manifest and your own `grep -rEc "(router|app)\.(get|post|put|patch|delete)\(" <controllers>` plus the `app.use` mounts). List differences; do not hide them.
- Every endpoint is tested, skipped (reason) or not testable (reason). None dropped (`render_report.js` Self-check shows 0 missing).
- Every endpoint has `tablesRead`/`tablesWritten` or is marked unresolved with a reason, and every table name was validated against the schema.
- Every failure shows method, path, probe type, status, trimmed body and a handler file:line where known.
- No tokens, passwords or secrets in the report or saved files (the scripts mask and refuse to write them; also grep the output).
- Nothing was modified: `git status` is unchanged by the run, and state how DB writes were ruled out (pg_stat deltas, whether the DB was idle, `statsNoisy`).
- Everything unverified is under "Not verified".

## Corrections become rules

False alarm or miss -> fix the root cause in the smallest durable place (process: this file; missing context: `reference/`; repeated error: a rule in `rules.md`), then rerun the same check to confirm.
