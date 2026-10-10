---
name: security-testing
description: "Runs security checks against the app and reports confirmed findings with a fix prompt and regression tests: secret scanning (gitleaks), static analysis (Semgrep, ESLint security rules), dependency audit (npm audit), a route-auth inventory that finds API routes missing authentication, and active SQL injection and web-attack scans (sqlmap, OWASP ZAP) against the local test environment, or staging only after explicit user confirmation. Use whenever the user says 'run a security scan', 'check for SQL injection', 'scan for leaked secrets', 'are any of my API routes missing auth', 'run the security checks before launch', or 'scan staging for vulnerabilities'. Do not use for readiness scoring, failure-path e2e tests, load tests, or anything against production."
---

# Security testing

Finds real vulnerabilities by running tools, never by reading the code and guessing. It scans the local test environment (or staging, with explicit confirmation), turns confirmed findings into a prioritized report, a fix prompt and failing regression tests, and never edits application code. Read `rules.md` first: its hard constraints apply at every step. Paths below are relative to this skill folder for scripts and to the repo root for outputs; run everything from the repo root.

## Workflow

1. **Pick the target.** Ask local or staging if not stated. For staging the user must type, in this conversation, an explicit confirmation naming the host (for example "yes, scan staging.example.com"). Never infer consent from earlier messages.
2. **Guard.** `node .claude/skills/security-testing/scripts/guard-scan-target.js --target <local|staging> [--confirm-host <host>]`. If it fails, stop and report why. Do not work around it or edit it.
3. **Tools.** `bash .claude/skills/security-testing/scripts/check-tools.sh`. For missing tools, show the exact commands in `scripts/install-tools.sh`; run `bash .../install-tools.sh` only after the user agrees. User-level installs only, never sudo.
4. **Static scans.** `bash .claude/skills/security-testing/scripts/run-static-scans.sh` (gitleaks on tree and history, Semgrep, npm audit, ESLint security rules). Run the saved script; do not write new scan code.
5. **Route-auth inventory.** `node .claude/skills/security-testing/scripts/route-auth-inventory.js`. Lists every API route, whether auth applies, and which are not in `security/public-routes.json`. Exit 2 means detection failed: say so, never report it as "no unprotected routes".
6. **Active scans.** `bash .claude/skills/security-testing/scripts/run-active-scans.sh --target <local|staging> [--confirm-host <host>]` (sqlmap and ZAP against `security/targets.json`). For local, the app must run against the local test database. Start it as `scripts/with-test-db.mjs` + `server/server.js` do (see `scripts/smoke-test.mjs`), or ask the user to start it. ZAP active scan on staging needs `"allowActiveScanOnStaging": true` in targets.json, the user's confirmation in this conversation, and `STAGING_ACTIVE_CONFIRMED=yes`.
7. **Manual checks.** Read `reference/checks.md` and test what tools cannot: IDOR (tenant B ids with tenant A token), tenant id from client headers or params, CSRF and CORS, file upload validation, SSRF-prone endpoints. Use only the test accounts in `.env.security`. Record results in `security/reports/raw/manual-checks.json` (`[{check,result,note}]`) and confirmed manual findings in `security/reports/raw/manual-findings.json` (`[{severity,title,location,evidence,status,recommendation,rule}]`).
8. **Report.** `node .claude/skills/security-testing/scripts/build-report.js` merges everything into `security/reports/security-report.md` (severity, location, redacted evidence, recommendation). Finding ids are stable across runs.
9. **Regression tests.** For each confirmed finding reproducible locally, add a test in `e2e/security/` following `reference/regression-test-patterns.md`. It asserts the secure behavior, so it fails while the finding is open and passes after the fix. Tag it `@open-finding` and put the finding id in the title. If the `e2e-failure-path-tests` skill already covers FP-11 (cross-tenant access) or FP-12 (unauthenticated routes), reference those tests instead of duplicating. Run them against the local test app and confirm they fail for the right reason (an assertion, not a connection error).
10. **Fix prompt.** Write `security/reports/fix-prompt.md` from `reference/fix-prompt-template.md`: findings ordered critical, high, medium, low, each with its failing regression test.
11. Hard constraints in `rules.md` apply at every step.

## Acceptance criteria

- The target guard passed before any active scan ran; for staging, the user's explicit confirmation naming the host exists in the conversation.
- Every tool either ran or is listed in the report as "not run" with the reason.
- The route-auth inventory lists every route; each unauthenticated route is on the allowlist or reported as a finding.
- Every finding has severity, location, redacted evidence and a recommended fix; unconfirmed tool output is labelled "unconfirmed", not "vulnerability".
- Every confirmed, locally reproducible finding has a regression test that fails now (`@open-finding`), and the report says so.
- No secret value appears anywhere in the report, raw output or chat.
- No application source file was modified; `git status` shows changes only in `security/`, `e2e/security/`, `.env.security.example` and this skill.

## Verification

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the tool outputs, the route inventory, the generated regression tests run against the local test environment, and git status, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
