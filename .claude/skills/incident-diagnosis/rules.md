# Hard rules (apply at every step)

1. **Read-only on production, always.** Only commands in `incident/allowed-remote-commands.json`, only through `scripts/remote-readonly.sh`; only single SELECT statements through `scripts/run-queries.js` as the read-only database user.
2. **Never run** `pm2 restart|reload|stop|delete|flush|reloadLogs`, `nginx -s`, `logrotate`, `kill`, `systemctl`, `sudo`, `rm`, `mv`, `chmod`, `chown`, or any command that writes, rotates, truncates or deletes anything on the VM. Never destroy or alter evidence.
3. **Never fix, restore, roll back, deploy, or change configuration.** Containment and recovery are options for the user to decide. The fix goes through `fix-prompt.md` and the deploy process.
4. **Never edit the guard or the allowlist to make a command pass.** If the guard fails, stop and tell the user why. (The allowlist is changed only by the user, deliberately, before an investigation.)
5. **Preserve evidence before analysis.** Copy, never move. Verify the manifest at the end (`collect-evidence.sh --verify`).
6. **No personal data in outputs.** Never print or store names, emails, phone numbers, IP addresses, tokens, secrets or row contents beyond internal ids and counts. Mask personal-data columns unless the user approves a specific column for this incident. `affected-ids.csv` is local, 0600, gitignored. Logs are stored redacted only: at pull time the raw file's SHA-256 and size go to `evidence/raw-hashes.txt` (part of the manifest), a redacted copy goes to `evidence/raw/`, and the raw temp file is deleted. Read `timeline.md`, not the log copies.
7. **Be gentle with production.** No expensive queries or large greps at peak load; use nice/ionice (the wrapper does), timeouts and row limits; stop if the host shows load (check `uptime` and `free`).
8. **Label confidence honestly.** "Confirmed" needs two independent pieces of evidence. Do not present a plausible story as the cause. List what is unknown.
9. **Blameless.** Refer to changes and commits, not people, unless the user asks.
10. **Strict on doubt.** If it is unclear whether a command or query could change anything, do not run it; ask.
11. **Keep it narrow.** No load tests, security scans, backup drills or deploys. Do not put this workflow in CLAUDE.md.
12. **Nothing on the VM is added.** No scripts are copied to the VM; the read-only database user and its `.pgpass` are used as they are.

Known failure modes to prevent: a "quick fix" on production during diagnosis; losing evidence to log rotation or `pm2 flush`; anchoring on the first hypothesis; counting affected users from reports instead of queries; leaking personal data; a heavy query slowing the database during the incident; a regression test that fails for the wrong reason; an announcement that says data is safe before it is confirmed.
