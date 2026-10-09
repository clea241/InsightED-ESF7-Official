# Probe types and expected results

Read when a probe result needs interpreting or a probe needs changing. Implemented in `scripts/run_probes.js`.

| Probe | Sent to | Request | Expect | Failure means |
|---|---|---|---|---|
| happy | GET/HEAD/OPTIONS | valid token, sample params, `queryDefaults` | 2xx, parseable JSON (or a binary download), right Content-Type | 5xx CRITICAL; HTML/non-JSON, 2xx with an error body, leaks, NaN/undefined/[object Object] in payload, U+FFFD, slow. 400/401/403/404/422 are "inconclusive" (missing sample data, role or required query), not failures |
| no-auth | every protected endpoint | no Authorization header, sentinel path params; writers get `{}` | 401 or 403 | 2xx CRITICAL; other 4xx MEDIUM (auth not first) ; 5xx CRITICAL |
| bad-input | GET/HEAD | sentinel path params (`__healthcheck_nonexistent__`) and a junk query (`limit=abc&page=-1&schoolYear=%00&q='`) | clean 4xx, or 2xx when the query is ignored | 5xx, timeout, stack trace or SQL in the body |
| writer | POST/PUT/PATCH/DELETE | malformed JSON, `{}`, wrong types (DELETE: sentinel id only) | 400/422 (or 401/403/404) and no table changed | 2xx on a non-DELETE CRITICAL; any table change CRITICAL (HIGH if DB stats are noisy) |
| latency | all | response time per probe | below `slowMs`, far below `timeoutMs` | MEDIUM slow, HIGH near timeout |
| table check | writer probes | `pg_stat_user_tables` before/after per endpoint, after `settleMs` | no insert/update/delete | see rules.md; calibrated first for background noise |

Skipped by design (listed in the report): destructive-looking paths, DELETE without an id, routes writing a whole-form JSON column, anything in the config skip list, public writer routes get malformed JSON only.

Response checks applied to every probe: valid JSON when the body looks like JSON; leak patterns (stack, file path, SQL/Postgres error text, secrets); DB error codes (3D000, 28P01, ECONNREFUSED); error-in-200; UTF-8 integrity; date-like fields should be ISO 8601; consistent error body shape across routes.

Server watching: with `--start-server` the runner captures stdout/stderr and attaches unhandled rejections, uncaught exceptions, DB error codes, TypeErrors and process exits to the probe that was running. For an already-running server set `logs.file` or `logs.pm2App`; otherwise this is reported under "Not verified".

Write mode (`--include-writes`): only configured `writeCases`, bodies with `__healthcheck_`, before/after table deltas compared with the static map (unpredicted write = CRITICAL, predicted but untouched = HIGH), cleanup request, leftover rows reported. It was not exercised in the first eSF7 run.
