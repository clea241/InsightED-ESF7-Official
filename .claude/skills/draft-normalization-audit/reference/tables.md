# Normalized table inventory (target tables)

Read when mapping a field or save path to its table. `scripts/inventory_tables.sql` lists live columns, constraints and FKs.

| Table | Holds |
|---|---|
| `esf7_school_profile` | school identity, curricular offerings, special programs |
| `esf7_personnel_profile` | teacher/staff identity (PK `id`; adviser FK target) |
| `esf7_personnel_employment` | employment details |
| `esf7_perssonel_educ` | education records. **Spelling is real (double-s). Do not flag or rename.** |
| `esf7_personnel_designations` | designations |
| `esf7_regular_sections` | class sections; `adviser_id` FK to `esf7_personnel_profile(id)` |
| `esf7_sned_sections` | SNED sections |
| `esf7_als_sections` | ALS sections |
| `esf7_workload_rows` | timetable / teaching load blocks |
| `esf7_admin_task` | administrative tasks |
| `esf7_related_task` | related tasks |
| `esf7_school_node_status` | derived per-node status (written by `syncDraftToNodeStatus` after a draft commit) |

Related, but not targets:
- `school_drafts`: transient state plus legacy rows.
- `esf7_room_roster_cache`: last-resort roster fallback. Anything served from it must be flagged "not confirmed saved".
- `esf7_migration_log`: migration bookkeeping.

Sibling section tables seen in code (aral, remedial/enrichment) belong in the matrix too if the inventory shows them.
