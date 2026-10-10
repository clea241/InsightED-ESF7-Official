# Hard rules

1. Never modify or delete rows in `esf7_room_roster_cache`; never `VACUUM`, `DROP` or `TRUNCATE` it. Disk reclamation is a separate step the user does after verification.
2. Dry run is the default. Apply needs `--apply` plus `--confirm-db <name>` equal to the connected database.
3. Only `esf7_local` and `insighted_esf7` are allowed; host must be loopback; `NODE_ENV` must not be `production`.
4. Backup before write; the script aborts if the backup cannot be written and re-read. Keep the backup until the user has dropped or shrunk the cache.
5. Existing normalized rows win: insert-if-absent only. Never `UPDATE` or `DELETE` an existing row.
6. Never regenerate a cache id. The cache id is stored unchanged in `esf7_personnel_profile.legacy_id`; the primary key is a new UUID because every live row already uses UUID keys (decision recorded when the skill was built; the original brief asked for the cache id as PK, which the current schema no longer follows). Matching an existing person: same `legacy_id` in the same school, or same `prn`, or same `id`.
7. Pilot school first, then all schools, each with explicit user approval. Approval for one step does not carry to the next.
8. One transaction per school; roll back that school only on failure and continue.
9. No unmapped data is silently dropped. Unknown keys and data-bearing keys with no target in this skill go to `needs_review.json`; deliberately skipped keys are listed in `reference/field-mapping.md`.
10. Do not edit `RoomQR.jsx` or the `/roster`, `/verify-passcode`, `/sync-roster` endpoints.
11. Use the real spelling `esf7_perssonel_educ`.
12. Do not write new migration code during a run. If the script is wrong, fix the script in `server/scripts/` (one copy only), then rerun.
13. Sections are not created: the cache has no section objects, only section ids and names on workload rows. They are listed in `needs_review` (`sections_not_created`).
14. Child rows (employment, education, designations, workload, admin, related) are inserted only for a person who has none of that kind yet, so reruns insert 0 rows. This can re-add rows someone deliberately deleted; mention it to the user before the all-schools apply.

## Halt thresholds (apply mode, checked after every batch, minimum 20 schools)
- flagged items > 2% of processed items
- FK failures (SQLSTATE 23503) > 1% of processed items
- failed schools > 1% of processed schools

"Flagged" counts items that were not migrated or were coerced. Three kinds are informational and not counted, because counting them would halt every run (a full dry run flagged 6.7% with them counted): `non_canonical_unreferenced` (new `local-p-` / `P-HARVEST-` ids kept in `legacy_id`, about 20% of ids), `required_placeholder` (NOT NULL employment columns missing in the cache, stored as `UNSPECIFIED`, never invented), and `possible_duplicate` (same name and birthdate, different prn; inserted, not merged, listed for review). Counted flags are the personnel that are not migrated at all: `missing_prn`, `missing_name`, `prn_collision_in_payload`, plus coerced values and id conflicts.

## Known failure modes to prevent
- Inserting workloads or tasks before their personnel (FK failure). The script inserts the profile first inside the school transaction.
- Re-keying a cache id that other tables already reference.
- Writing "N/A" strings into date or numeric columns (placeholders become NULL).
- Treating the cache as authoritative and overwriting newer normalized data.
- Dropping the cache before verification, or before the `out_of_scope_key` entries (learning-area matrices, training rows, harvester timetable grids) have a home.
