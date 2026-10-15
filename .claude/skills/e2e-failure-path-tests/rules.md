# Rules for e2e-failure-path-tests

These are hard constraints. They apply at every step of the workflow in `SKILL.md`.

## Environment safety

1. Never run against staging or production. Tests run against a local app and a local, disposable test database only.
2. If `scripts/guard-test-env.js` fails, stop and tell the user why. Never edit the guard to loosen it, never work around it, never start the app or a test after a failed guard.
3. If anything is ambiguous about whether an environment is safe, stop and ask. Do not run.
4. `server/loadEnv.js` lets the root `.env` override the process environment unless `NODE_ENV=test`, and several modules hard-code real database names. So the runner must keep `NODE_ENV=test`, pin every connection variable to `.env.test`, and keep the `scripts/pin-db.cjs` preload on every Node process it starts. Do not remove any of these.
5. Do not run the legacy `server/create_*.js` / `migrate_*.js` scripts directly: several connect to the real database name `insighted_esf7`. The only schema source used is `server/schema.sql` plus the two `school_drafts` scripts, through the pinned runner.

## Secrets and data

6. Never read, print, copy or commit secrets. `.env.test` is gitignored; `.env.test.example` holds placeholders only. Print variable names and PASS/FAIL, never values.
7. Test data is synthetic. Never copy real data into the test database, never seed in production-like shapes that contain real personal data (names, emails, school records).
8. No destructive commands outside the guarded test database: no `DROP`, `TRUNCATE`, `FLUSH*`, `pm2 delete`, `pm2 stop all`. The only permitted drop is the runner recreating the single database named in `.env.test` after the guard passed.
9. Do not call real external services. Mock them with `page.route()` or use local stand-ins.

## Tests

10. No fixed sleeps (`waitForTimeout`, `setTimeout` waits) and no retry-until-green. Wait on a UI or network signal. Fix the cause of flakiness (wrong signal, shared data); never add retries (`retries` stays 0) or longer timeouts to hide it.
11. Do not delete or weaken an existing test to make a run pass. A failing test is a finding: report it, with the failing assertion and the data lost or at risk.
12. Never rewrite or delete existing passing tests unless the user asks. Add new tests only for a new feature or a newly discovered failure.
13. Every test title starts with its scenario ID (`FP-nn`).
14. Each test creates its own tenant and records (`newTenant()`); no shared state between tests and no order dependence.
15. Assert in the database, not only in the UI: a UI that optimistically shows "saved" would otherwise pass.

## Scope

16. Keep the skill narrow: failure-path end-to-end tests. No load testing, security scanning, deploy or backup logic.
17. Do not put this workflow into `CLAUDE.md`. If the user asks, add one line that points to `.claude/skills/e2e-failure-path-tests/` and nothing else.

## Known failure modes to prevent

- Tests that pass because the UI optimistically shows success (assert in the database).
- Shared test data between tests causing order dependence (one tenant per test).
- Tests that assert only on the UI and miss data that is actually missing in the database.
- Seeding data in production-like shapes that contain real personal data.
- A test that passes because the failure injection never ran (always assert the injected response was served, for example by counting attempts).
- Leaking background processes: the runner must stop the embedded database (children first), the app and the preview server on every exit path.
