# Hard rules

## Read-only and safe mode

- Read-only. Never modify tracked repo files, the database, nginx, PM2 or any server state. The only writes are the report files under `readiness-reports/`.
- **Safe mode is the default.** Without opt-in flags the skill only reads local files. Never enable an opt-in on your own; the user must say yes to each one.
- Report folders are created `0700` and files `0600`.
- When in doubt, skip the check and mark it `unknown`. Data safety outranks completeness.

## Opt-in flags (exact list)

`--probe-staging`, `--check-db`, `--allow-npm-audit`, `--run-nginx-test`, `--probe-rate-limit`, plus `--safe-routes FILE` (only used together with `--probe-staging`).
`--probe-staging`, `--probe-rate-limit` and `--check-db` also require `--confirm-staging`; without it the script exits 1 and does nothing.

## Allowed external commands (allowlist)

Always: `git ls-files`, `git log`.
Only with the flag shown: `npm audit --json` (`--allow-npm-audit`); `nginx -t -c <file> -p <temp dir>` with the error log sent to the null device (`--run-nginx-test`); `psql` (`--check-db`).
Everything runs through `child_process.execFile`, never a shell string. Nothing else is permitted.

## Staging network probes

- Only probe a **staging** URL, and only with both `--probe-staging` and `--confirm-staging`. Refuse if the hostname looks like production (contains `prod` or `production`, or is the bare apex/`www` host found in the nginx production `server_name`) or the user cannot confirm it is staging.
- HTTP methods are limited to GET, HEAD and OPTIONS. No POST/PUT/PATCH/DELETE.
- Never crawl GET routes found in code (a GET can mutate data). Call only the health endpoint, the fixed sensitive-path list, the fixed unknown-API-route probe, and routes the user lists in `--safe-routes`.
- The rate-limit probe is at most 30 GET requests to the health endpoint in 10 seconds and stops on the first `429` or `5xx`. Warn the user beforehand that it may trigger WAF or alerting on staging.

## Database

- Access only with `--check-db --confirm-staging`, only through a role proven read-only, and only `SELECT` against `information_schema` and `pg_catalog`, inside a read-only transaction. **Never read from application tables, and never store row data.**
- If the role has any write capability (superuser, CREATEDB, CREATEROLE, CREATE on the database or any schema, INSERT/UPDATE/DELETE/TRUNCATE on any table, or membership in `pg_write_server_files`, `pg_execute_server_program` or `pg_read_server_files`), **refuse to run any further query**, record the reason, and tell the user to create a read-only role.
- The database URL comes from `STAGING_DATABASE_URL`. Never print or store it.

## Dependencies and nginx

- `npm audit` contacts the registry and is opt-in (`--allow-npm-audit`); otherwise read a supplied `--audit-file` or mark the dependency checks `unknown`.
- `nginx -t` is opt-in (`--run-nginx-test`); by default nginx config is parsed as text only.

## Evidence discipline

- Never mark `pass` without cited evidence. Never invent check IDs. `na` requires a justification. `unknown` counts as a fail in the score.
- If an evidence section is skipped, mark the dependent checks `unknown` with the note "skipped in safe mode". Never guess a pass from missing evidence.
- Never print or store secret values. Report only file, line and secret type.
- Never run load tests, sqlmap, OWASP ZAP or any attack tooling from this skill. Mark those checks `unknown` and recommend running them separately on staging with authorization.

## Output

- Always generate `fix-prompt.md`, even when the score is 100 (then it states that no fixes are required).
- This skill reports and generates a prompt; it does not apply fixes unless the user explicitly asks in a separate request.

## Known failure modes to prevent

- Scoring from memory instead of evidence.
- Treating a missing file as a pass.
- Probing production.
- Leaking secrets into `evidence.json` or `report.md`.
- Reporting a high score while a critical check fails.
