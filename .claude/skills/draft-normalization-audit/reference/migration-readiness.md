# Migration readiness (legacy school_drafts -> normalized)

Read only when legacy rows are in scope. Authority: `server/scripts/disaggregate_school_drafts.js` and `docs/living/SCHOOL_DRAFTS_MIGRATION_ANALYSIS.md`. For live progress use the `migration-progress` skill instead.

Safety gates to confirm in the script (cite file:line; do not just trust this list):
- `--dry-run` is the default; `--apply` needs `--confirm-db <name>` matching the current DB exactly.
- Refuses production, a non-loopback host, or a DB outside the allowlist (`esf7_local`, `insighted_esf7`).
- Pre-write backup to `server/backups/`; the full-cluster backup needs at least 2000 MB free disk.
- One transaction per school; `school_drafts` rows are never modified or deleted; existing rows win.
- Personnel are inserted before sections; anomalies go to `needs_review_<timestamp>.json`.

Halt thresholds (dry-run gates): any school failed (Gate 1); flagged rate > 2% (Gate 2); existing rows overwritten or deleted (Gate 3, must be 0); unresolved FK rate > 1% (Gate 4). During apply, a batch failure rate > 1% halts the run.

Report: whether a recent backup exists (list `server/backups/`, do not open the contents), the latest dry-run gate result if one is on disk, and that the audit ran no `--apply`.
