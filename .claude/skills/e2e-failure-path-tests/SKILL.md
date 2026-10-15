---
name: e2e-failure-path-tests
description: "Runs and maintains Playwright end-to-end tests for failure scenarios (failed or slow saves, logout with pending saves, 502/503/504 responses, killed queue workers, Redis down, cross-tenant access) against a local app and a local test database, and reports which scenarios are covered. Use whenever the user says 'run the failure path tests', 'test what happens when saving fails', 'check we don't lose data on logout', 'add e2e tests for <feature>', 'run the e2e tests before I deploy', or 'test cross-tenant access'. Do not use for unit tests, load tests, security scanning, or anything against staging or production."
---

# E2E failure-path tests

This skill tests how the app behaves when things go wrong, with data loss as the main harm: a save that fails or is slow, a logout or tab close with a save pending, a gateway answering with HTML, a session that expires, two sessions editing the same record, a killed worker, Redis down, and one school reaching another school's data. The tests are Playwright specs kept in `e2e/failure-paths/` and re-run every time (never regenerated). They run only against a local app and a local, disposable test database that the runner creates, so nothing here can touch staging or production data.

Scripts are in `.claude/skills/e2e-failure-path-tests/scripts/` (shown as `$S`). Run everything from the repo root. Execute the saved scripts; do not write new runner code.

## Workflow

1. Run `node $S/guard-test-env.js`. If it fails, stop and report why. Do not continue and do not try to work around it. (If `.env.test` does not exist, copy `.env.test.example` to `.env.test` and put a fresh random value in `JWT_SECRET`; never print it.)
2. Read `reference/scenarios.md` to know the required scenarios and which ones apply to this app.
3. Run `node $S/coverage-matrix.js` to see which scenarios already have a test and which are missing.
4. Run `bash $S/run-failure-paths.sh` (optionally `--grep <pattern>`) to start the app against the test database, run the saved tests, and tear down. Execute the saved script directly; do not write new runner code.
5. If the user asked for tests for a new feature, or the matrix shows a missing applicable scenario, write new test files in `e2e/failure-paths/` following `reference/playwright-patterns.md`. Never rewrite or delete existing passing tests unless the user asks.
6. Re-run steps 3 and 4, then write the report with `node $S/coverage-matrix.js --report` (it writes `e2e/reports/failure-path-report.md` from the Playwright results and `e2e/failure-paths/findings.json`).
7. For each failing test, decide whether it is a real app bug or a flaky or incorrect test and record it in `e2e/failure-paths/findings.json` (`id`, `test`, `classification`, `dataLost`, `notes`), then regenerate the report. For flakiness, fix the cause (wait on the right signal, isolate the data); never add retries or longer sleeps to hide it. For an app bug, keep the failing test as it is and report the failing assertion and the data lost or at risk.

`rules.md` holds the hard constraints. They apply at every step; read it before the first run.

## What the runner does

`run-failure-paths.sh` runs the guard, loads `.env.test` only, uses the PostgreSQL on the configured local port or starts a disposable embedded one there, drops and recreates the single test database named in `.env.test`, applies the project schema (`server/schema.sql` plus the `school_drafts` scripts; this repo has no `db:migrate` script), starts the backend (`NODE_ENV=test`, every connection variable pinned, `pin-db.cjs` preloaded), builds and serves the client against it, runs `npx playwright test -c playwright.failure-paths.config.ts`, and stops everything it started on every exit path. Exit code = Playwright result (2 = guard or setup failure, no test ran).

Test data: no seed script exists in this repo and the runner does not invent one. Each test creates its own tenant (a fresh school id with a signed token, `newTenant()`) and its own records through the app's API, so cross-tenant tests always have at least two tenants with a user each.

## Files

- `scripts/guard-test-env.js`: refuses to run unless the environment is local and disposable.
- `scripts/run-failure-paths.sh`: the one way to run the tests.
- `scripts/test-db.mjs`, `scripts/pin-db.cjs`: embedded test database helper and the connection-pinning preload (used by the runner).
- `scripts/coverage-matrix.js`: scenario coverage matrix (`--report` writes the report).
- `reference/scenarios.md`: the scenario catalog and applicability for this app.
- `reference/playwright-patterns.md`: how to write a test here, with a complete FP-02 example.
- Repo files: `.env.test.example`, `playwright.failure-paths.config.ts`, `e2e/failure-paths/` (tests, `helpers.ts`, `findings.json`), `e2e/reports/` (generated, gitignored).

## Acceptance criteria

- `guard-test-env.js` passed before any test ran.
- Every applicable scenario in `reference/scenarios.md` has at least one test, or is listed in the report as "not applicable" with a reason.
- All tests pass twice in a row (no flakiness), or each failure is reported as a suspected app bug with the failing assertion and the data lost.
- No test relies on fixed sleeps; no test uses real third-party services.
- No existing test file was modified or deleted unless the user asked.
- The report lists scenarios, test file names, and pass/fail.

## Verification step

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the Playwright run output, the coverage matrix script, and a second full run, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.

## Using it in another repo

The guard, rules and coverage matrix are generic. Adapt only the runner: the start commands, the readiness endpoint, how the schema is created (a migration script if one exists), and the helpers' login method. Keep every safety property: guard first, a pinned test database, no secrets printed, nothing outside the test database dropped.
