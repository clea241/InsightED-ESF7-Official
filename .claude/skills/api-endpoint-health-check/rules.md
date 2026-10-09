# Rules, severities and lessons learned

## Hard safety rules
1. Loopback only. The runner refuses any base URL whose host is not localhost/127.0.0.1/::1 and any DB host that is not loopback. Never production (`NODE_ENV=production` also refuses).
2. DB allowlist from config (`esf7_local`, `insighted_esf7` for eSF7). Any other name, or a name that cannot be determined, refuses. A `3D000` or any connection error in a response is a finding.
3. Database access is SELECT-only (`lib.assertSelectOnly` rejects anything else) and read-only at session level. No migrations, no `--apply`.
4. Default mode never sends a valid write. Invalid-payload probes are skipped for destructive-looking paths (`destructivePathPattern`), DELETE routes without a path id, and routes that write a whole-form JSON column. Public (unauthenticated) writer routes get malformed JSON only. Escalation stops at the first 2xx.
5. `--include-writes` only runs configured `writeCases`, each body carrying `__healthcheck_`; it cleans up and reports leftovers. Only when the user asked for it in the current request.
6. Never print, store or log tokens, passwords or secrets; output is masked and the scripts refuse to write a file containing a known secret. Credentials come only from env vars or a local env file. Never create accounts; never guess passwords or use hard-coded dev shortcut passwords found in code.
7. Do not guess routes, tables or columns. Unresolved means unresolved, with a reason.
8. `esf7_perssonel_educ` (double-s) is the real table name. Never flag or "fix" it.
9. Rate-limited, and the run aborts after N consecutive connection failures.

## Severities
- CRITICAL: any 5xx; process crash/restart; unhandled rejection in the server log; stack trace, SQL, file path or secret in a response; protected route answering 2xx without auth; invalid write payload accepted with 2xx; an invalid-payload probe changed a table (confirmed only when the DB stats were quiet).
- HIGH: error inside an HTTP 2xx; non-JSON where JSON is expected; hang/timeout; DB connection/config error in a response; static table map and runtime disagree; whole-form JSON written to one column; table referenced in code but missing from the schema; table change that is only "possible" because the DB was noisy.
- MEDIUM: slow beyond threshold; missing/wrong Content-Type; inconsistent error body shapes; unresolved/partial table mapping; auth not the first check (4xx other than 401/403 without a token).
- LOW: undocumented/duplicate/dead routes; malformed id answered with 404; non-ISO dates.
- OK: healthy. `gate-only` means only the 401/403 gate was checked because no credentials were available; it is not "healthy".

## Lessons learned
- 2026-10-09 first run: `POST /api/room-profiling/snapshots` (a public route) accepted `{}` and a wrong-types body and inserted two rows into `esf7_profiling_snapshots`, one with `school_id = "[object Object]"`. Rule 4 now limits public writer routes to malformed JSON and stops escalation after a 2xx. The table check found it, so keep it on.
- The express default error page shows a stack trace when `NODE_ENV` is not `production`. The runner does not force `NODE_ENV`; report that leak as real but mention the environment dependence.
- Pilot accounts in `server/pilot_credentials.json` did not log in. Do not fall back to dev shortcut passwords in code; ask for `HC_IDENTIFIER`/`HC_PASSWORD`.
- `/api/health` routing to the strict deep check (503 when Redis is down) contradicts the comment above it in `server/server.js`; a health probe is the place this shows up.
- pg_stat counters lag ~1 s and include every client: the runner calibrates first and downgrades to "possible" when the DB is not idle.
