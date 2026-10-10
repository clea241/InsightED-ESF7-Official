# Template for security/reports/fix-prompt.md

Copy this structure, fill the findings from `security/reports/raw/normalized-findings.json`, never include secret values.

---

# Security fix prompt

## Guardrails (read first)
- Work on staging first, never directly on production.
- Take a backup before any change that touches data or schema.
- One change at a time; run its regression test before the next.
- Write a rollback for each change before making it.
- No destructive commands (no DROP, TRUNCATE, bulk DELETE, force push).
- Redact secrets in all output and commits.
- Stop and report on any unexpected result.

## Findings (critical, then high, medium, low)

### SEC-NNN <title> (<severity>, <confirmed|unconfirmed>)
- **Location:** `path:line`
- **Why it matters:** one or two plain sentences on the impact.
- **Failing regression test:** `e2e/security/<file>.spec.mjs` ("SEC-NNN ... @open-finding"); it must turn green.
- **Suggested fix:** concrete change.
- **How to verify:** run that test, then the full suite.

(repeat per finding)

## Finish
- Run the full test suite, then run the security-testing skill again and confirm the findings are gone.
- Remove the `@open-finding` tag from tests that now pass.
- Rotate any secret that was ever committed, even if it was later deleted from the code.
