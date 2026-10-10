---
name: room-roster-cache-migration
description: One-time migration of `esf7_room_roster_cache` into the normalized esf7 tables (personnel profile, employment, education, designations, workload rows, admin and related tasks). Use when the user says "migrate the room roster cache", "disaggregate esf7_room_roster_cache", "move room cache data into the normalized tables", "recover orphaned personnel from the roster cache", or asks to dry-run or apply that migration for one school or all schools. Do NOT use for changing RoomQR or the sync-roster endpoint, for the school_drafts migration, or for VACUUM or disk reclamation.
---

# Room roster cache migration

## Purpose
Capture every piece of data stored in `esf7_room_roster_cache` and move it into its proper normalized tables, safely and idempotently, so the cache can later be shrunk or dropped without data loss. The cache is about 1.1 GB across 10,697 schools, more than 99.7% of it TOAST, because full nested JSON is stored per school. 592 schools and about 12,100 personnel exist only in the cache. Dropping or truncating the cache before migration causes permanent data loss. This is a pure migration skill: it does not change app code or endpoints and does not reclaim disk space. The skill never modifies or deletes cache rows.

What the cache looks like: `roster_json` is an array of personnel objects (mixed camelCase, snake_case and harvester keys) with nested `workloadRows`, `administrativeRows`, `teachingRelatedRows`, degree rows and designations. There are no section objects.

## Run the saved scripts, do not write new code
- `scripts/disaggregate_room_roster_cache.js` (dry-run by default)
- `scripts/verify_room_roster_migration.js` (read-only checks)

Both are thin wrappers around the single real implementation in `server/scripts/` (repo convention). Run them from the `server/` folder, e.g. `node ../.claude/skills/room-roster-cache-migration/scripts/disaggregate_room_roster_cache.js --school 300488`. If the output is wrong, fix the script under `server/scripts/`, never generate a second migration program.

Arguments: `--dry-run` (default), `--apply`, `--confirm-db <name>`, `--school <id>` (repeatable or comma-separated), `--batch-size <n>` (default 50), `--out-dir <path>` (default `./migration-output/room-roster-cache/<timestamp>/`). Outputs: `summary.json`, `needs_review.json`, `existing_won.json`, `report.md`, and `backup_<timestamp>.json` (apply only).

## Reference files
- `reference/field-mapping.md`: read before the first dry run and whenever a JSON key shows up as unmapped.
- `reference/id-formats-and-fks.md`: read before any apply.
- `rules.md`: hard constraints and halt thresholds. Read it before starting.

## Workflow
1. Confirm the target DB name. Only `esf7_local` and `insighted_esf7` are allowed. Refuse anything else. (Loopback host only, never production.)
2. Read `reference/field-mapping.md` and `reference/id-formats-and-fks.md`.
3. Run the script in default dry-run mode for one pilot school. Ask the user which; default to school 300488 if they have no preference. A cache-only school is a better apply pilot (one that has no rows in `esf7_personnel_profile`); offer one, e.g. 500008 on esf7_local.
4. Review the dry-run summary and `needs_review.json` with the user. Report counts of: schools scanned, personnel found, already in normalized (existing row won), to insert, ID-format breakdown, non-canonical IDs preserved, flagged, failed.
5. Only after explicit user approval, apply the pilot school: `--apply --confirm-db <db> --school <id>`.
6. Run `scripts/verify_room_roster_migration.js --school <id> --run-dir <run output dir> --backup <backup file>`. Re-run the same apply once: it must insert 0 rows.
7. Only if every check passes and the user approves again, apply all schools in batches (no `--school`). The run halts by itself on the thresholds in `rules.md`.
8. Run the verify script for all schools and write the final run report to `docs/living/ROOM_ROSTER_CACHE_MIGRATION_REPORT.md` (counts, flagged items by kind, anything left in `needs_review`, and the explicit statement that the cache was not touched).

## Decisions baked in (ask before changing)
- Personnel keying: new UUID primary key, cache id kept unchanged in `legacy_id` (the live table is 100% UUID). Status is set from the id format.
- Sections are not created; section ids/names from workload rows are listed in `needs_review`.
- Data with no target table in this skill (learning-area matrices, training and certification rows, harvester timetable grids, sharing flags) is reported once per key as `out_of_scope_key`. The cache must be kept until the user decides where those go.

## Acceptance criteria
- Dry run for the pilot school completes with 0 failed and every flagged item explained in `needs_review`.
- After apply, every personnel record in the cache payload for the migrated schools exists in `esf7_personnel_profile` (or was intentionally skipped because an existing normalized row won, listed in `existing_won.json`, or was flagged in `needs_review`).
- No existing normalized row was modified.
- Missing personnel are inserted with new UUIDs, the right status, and the original ID preserved in the legacy_id column (no prefixed IDs used as primary keys).
- Zero FK violations (the verify script checks all 20 FKs that reference `esf7_personnel_profile(id)`, discovered from `pg_constraint`).
- A second apply run on the same school inserts 0 rows (idempotent).
- Every top-level and nested JSON key found in the cache payloads is either mapped to a table column, listed as deliberately skipped in `reference/field-mapping.md`, or listed in `needs_review`; none is silently dropped.
- `esf7_room_roster_cache` row count and total payload size are identical before and after the run.

## Verification step
Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the verify script output, row counts and FK checks against the live database, and the dry-run versus post-apply diff, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
