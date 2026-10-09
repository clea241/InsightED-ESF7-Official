# Rules and severities

## Hard rules
1. Read-only. SELECT only. No `--apply`, no INSERT/UPDATE/DELETE/DDL, no network calls, no code edits during the audit.
2. DB allowlist: `esf7_local`, `insighted_esf7`; host must be loopback (`localhost`, `127.0.0.1`, `::1`). Never run against production. `INSIGHTED_DB_NAME` must equal `esf7_local` (single shared pool); a mis-cased name once caused `database "insightEd" does not exist (3D000)`.
3. `school_drafts` rows are never modified or deleted by the audit (or by the migration script).
4. `esf7_perssonel_educ` (double-s) is the real table name. Do not flag it as a typo or "fix" it.
5. Existing normalized rows win over draft data.
6. Never copy secrets (DB passwords, JWT secrets) into the report.
7. Do not call something "saved" unless a DB write was confirmed in code or query output.

## Severities
- **Critical:** committed data exists only in `school_drafts` (draft-only commit); a path that deletes or overwrites normalized rows from draft data; a write path that can run against a non-allowlisted DB.
- **High:** a read treats `school_drafts` or `esf7_room_roster_cache` as the source of truth without a "not confirmed saved" label; a dual write (draft + normalized) that can diverge; success reported before the DB commit.
- **Medium:** a business rule enforced only in the client; a multi-table write without a transaction; a missing FK/unique key that allows duplicates.
- **Low:** naming, logging, dead references to `school_drafts`.
- **OK:** transient state only (autosave overlay, restore prompt, version check).
