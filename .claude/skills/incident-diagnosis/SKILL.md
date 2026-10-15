---
name: incident-diagnosis
description: "Diagnoses production incidents read-only: preserves evidence first, builds a timeline from logs and PM2 and nginx data, tests hypotheses against the evidence, measures which tenants and users are affected with read-only database queries, and produces a diagnosis report, a safe fix prompt, a regression test that reproduces the root cause, and an honest draft announcement. Use whenever the user says 'something broke in production, find out why', 'teachers say their class sections disappeared', 'investigate this error spike', 'why are users getting logged out', 'how many schools are affected by this', or 'do an incident investigation'. Never changes production. Do not use for load tests, security scans, deploys, backup drills, or writing general e2e tests."
---

# Incident diagnosis

Find the cause of a production problem and measure who is affected, with evidence, without making things worse. The skill only reads: it never fixes, restarts, restores or deploys. The fix follows the generated `fix-prompt.md` through the normal deploy process. Scripts are in `.claude/skills/incident-diagnosis/scripts/` (`$S`); run everything from the repo root and execute the saved scripts, do not write new investigation code. Hard constraints are in `rules.md` and apply at every step.

Setup (once): copy `.env.incident.example` to `.env.incident` and fill it in; `incident/allowed-remote-commands.json` is the allowlist (the user edits it, never the agent).

## Workflow

1. **Intake.** Ask (at most three questions at a time, skipping what is known): what users report, when it started, which schools or users are named, what changed recently (deploys, config, secrets rotated, migrations, Redis changes), and whether data is being lost right now. Create the id `YYYYMMDD-HHMM-<short-name>` and the folder `incident/<id>/`.
2. **Guard.** `node $S/guard-incident-env.js --mode investigate --incident <id>` (add `--target staging` for a dry run). If it fails, stop and report why. Do not work around it.
3. **Holding message and containment (first, time matters).** Write `incident/<id>/holding-message.md`: do not clear browser data, do not discard unsaved changes, do not log out if a save is pending, we are investigating. If data may still be getting lost, list containment options for the user to decide (maintenance page, pause the queue worker, block deploys, roll back the last release using the deploy runbook), each with trade-offs. Never execute them.
4. **Preserve evidence.** `bash $S/collect-evidence.sh --incident <id> --since <time> --until <time>`. It copies logs (stored redacted; each raw file's SHA-256 is recorded in `evidence/raw-hashes.txt`, the raw copy is discarded) and takes status snapshots read-only, and writes `evidence/MANIFEST.sha256`. Release marker stays UNKNOWN unless `RELEASE_MARKER_FILE` is set. Read `evidence/snapshots/backups.txt`: if the newest backup is older than the user's acceptable data loss, tell the user to take a manual backup before any fix and record it in the report. Do not investigate further until evidence is preserved.
5. **Timeline.** `node $S/build-timeline.js` merges the evidence into `timeline.md/json`: deploys, restarts, first error occurrences, error spikes, status codes (401, 403, 502, 503, 504), worker retries, Redis fallbacks, auth failures, gaps. Read `timeline.md`, never the raw logs.
6. **Hypotheses.** Read `reference/investigation-method.md` and `reference/hypothesis-patterns.md`. List at least three competing hypotheses, including ones unrelated to the first idea. Test each against the evidence and mark it supported, contradicted or inconclusive. Consider related symptoms together (wrong school id, 403 loops, missing data, forced logouts).
7. **Blast radius.** Use the queries in `reference/query-library.md` (adapt names there once, not per incident). Run only via `node $S/run-queries.js --name <n> --lib <query> --param k=v [--export-ids school_id]`. Report counts per tenant, the time range of affected records, and whether data is missing, wrong, or only hidden. Ask the user before approving any masked column (`--approve-column`).
8. **Data loss assessment.** What is lost; what is recoverable (device drafts, newest backup, queue contents, logs); what is not. Do not restore anything: list recovery options with trade-offs.
9. **Root cause statement.** `confirmed` only with at least two independent pieces of evidence (a log sequence and a database result, or a code path and a reproduction); otherwise `probable` or `unknown`. List contributing factors, the trigger, and what is not known.
10. **Reproduce locally.** `node $S/guard-incident-env.js --mode repro`, then write the regression test per `reference/regression-test-pattern.md` in `e2e/incidents/INC-<id>-<short-name>.spec.ts`. It asserts the correct behaviour, so it fails now (`@open-incident`) and passes after the fix. Run it on the local test environment and confirm it fails for the stated reason. If the cause cannot be reproduced locally, say so in the report; never invent a test.
11. **Reports.** Write `incident/<id>/investigation.json` (fields listed at the top of `build-incident-report.js`), then `node $S/build-incident-report.js`. It writes `diagnosis-report.md`, `fix-prompt.md` (guardrails first, regression test named) and `announcement-draft.md` (per `reference/announcement-guidelines.md`). Unknown fields stay `UNKNOWN: ...`.
12. **Verify production is unchanged.** `bash $S/collect-evidence.sh --incident <id> --verify` re-checks the manifest, compares PM2 restart counts and the release marker with the start, and audits `commands.log` against the allowlist (`node $S/guard-incident-env.js --audit-log`).
13. `rules.md` holds the hard constraints; they apply at every step.

Outputs (all in `incident/<id>/`, gitignored): `evidence/`, `commands.log`, `timeline.*`, `results/`, `diagnosis-report.md`, `fix-prompt.md`, `announcement-draft.md`, `holding-message.md`, `affected-ids.csv` (internal ids only, 0600); plus one test in `e2e/incidents/`.

## Acceptance criteria
- The guard passed before any remote command ran; every remote command and query is in `commands.log` and was on the allowlist.
- Evidence was preserved with a checksum manifest before analysis began, and the manifest still verifies at the end.
- The report has a timeline, at least three hypotheses with evidence for and against, and a root cause with an honest confidence label.
- Blast radius numbers come from logged read-only queries, and the query text is in the report.
- No names, emails, phone numbers, IP addresses, tokens or secrets appear in the report, announcement, chat or `commands.log`; only internal ids and counts. `affected-ids.csv` holds ids only.
- A regression test exists and was run locally, failing for the stated root cause, or the report states why reproduction was not possible.
- The fix prompt contains the guardrails (staging first, backup first, one change at a time, a rollback for each, no destructive commands, redact secrets, stop on unexpected results).
- The announcement states only confirmed facts, apologises for known losses, says what happened in plain language, tells users what to do, and does not promise that data is safe unless confirmed.
- Production was unchanged: restart counts and release marker are the same before and after.

**Verification step:** Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the evidence manifest check, the commands log, the query outputs, and the local regression test run, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
