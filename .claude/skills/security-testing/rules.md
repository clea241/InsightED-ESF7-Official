# Hard rules (apply at every step)

1. Never scan production, any host in PRODUCTION_HOSTS, or any system the user does not own. There is no override.
2. Staging scans need an explicit confirmation naming the host in the current conversation, every time.
3. Never edit `guard-scan-target.js` to loosen it. If it fails, stop and tell the user why. If it is ambiguous whether a target is safe, stop and ask.
4. Never use forbidden sqlmap options (`--dump`, `--dump-all`, `--passwords`, `--os-shell`, `--os-cmd`, `--file-read`, `--file-write`, `--sql-shell`, `--priv-esc`). Never exfiltrate, dump or store real data.
5. Never print, copy or commit secrets, tokens or personal data. Redact in reports and chat. If a secret was found in git history, tell the user to rotate it.
6. Never modify application code. The skill reports, writes the fix prompt and adds tests only.
7. Use test accounts only; never log in as a real user.
8. Label tool output without confirmation as "unconfirmed". Do not present a scanner hit as a proven vulnerability.
9. Do not put this workflow into CLAUDE.md. (If the user asks, add one line pointing to `.claude/skills/security-testing/`.)

## Known failure modes to prevent

- Scanning the wrong host because of a copied URL: always run the guard first and compare the host.
- sqlmap destroying or exposing data: fixed safe options only; the runner aborts on forbidden ones.
- "No routes found" read as "all routes protected": detection failure is exit 2 and a loud warning.
- Reports that leak the secrets they found: gitleaks runs with `--redact`; the report builder redacts again.
- Regression tests that pass because they test the wrong tenant or an unauthenticated session: assert the status AND that the token and tenant are the intended ones; confirm each test fails for the right reason before reporting it.
