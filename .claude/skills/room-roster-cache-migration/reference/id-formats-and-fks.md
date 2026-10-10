# ID formats and foreign keys

Measured on `esf7_local` (311,000 personnel entries across 10,697 schools; entries are repeated per school, see unique counts in a dry-run summary):

| Cache id format | Entries | Share | Stored as |
|---|---|---|---|
| `PER-<school>-<nnn>` (canonical) | 245,933 | 79.1% | `legacy_id`, status `canonical` |
| `P-HARVEST-...` (harvester) | 33,875 | 10.9% | `legacy_id`, status `harvester-created` |
| `local-p-...` (temporary UI) | 30,685 | 9.9% | `legacy_id`, status `client-created` |
| anything else | 260 | 0.1% | `legacy_id`, status `client-created` |

The brief quoted about 83.4% / 8.7% / 7.8% for canonical / local-p / harvest. A full dry run counted unique ids per school as PER 244,924, P-HARVEST 33,875, local-p 30,669, other 260 (79.1 / 10.9 / 9.9 / 0.1%), so those brief figures do not match the cache as measured. Use the `id formats` line of a fresh dry run for current numbers.

## Preservation rule (as built)
Every row in `esf7_personnel_profile` already has a UUID primary key (388,113 of 388,113), with the old id in `legacy_id` and `status` in (`canonical`, `client-created`, `harvester-created`). So:
- The cache id is kept unchanged in `legacy_id`; the PK is a new UUID. This replaces the brief's "cache id as primary key" rule, by user decision.
- None of the 20 FK child tables holds a `PER-` or `local-p-` value; they hold the UUID. A non-canonical cache id counts as "referenced" when it matches an existing `legacy_id`; that row is kept untouched and listed in `existing_won.json`.
- New non-canonical ids are inserted and reported once, aggregated, as `non_canonical_unreferenced` for later re-keying decisions.
- Duplicates (same name + birthdate, different prn/id) are flagged `possible_duplicate`, never merged.

## The 20 foreign keys referencing `esf7_personnel_profile(id)`
Discovered from `pg_constraint` on esf7_local:

| Table | Column | On delete |
|---|---|---|
| esf7_admin_task | personnel_id | CASCADE |
| esf7_als_sections | adviser_id | SET NULL |
| esf7_aral_sections | tutor_id | SET NULL |
| esf7_personnel_designations | personnel_id | CASCADE |
| esf7_personnel_employment | personnel_id | CASCADE |
| esf7_personnel_ld_trainings | personnel_id | CASCADE |
| esf7_personnel_learning_areas | personnel_id | CASCADE |
| esf7_perssonel_educ | personnel_id | CASCADE |
| esf7_regular_sections | adviser_id | SET NULL |
| esf7_related_task | personnel_id | CASCADE |
| esf7_remedial_enrichment_sections | assigned_teacher_id | SET NULL |
| esf7_requests | personnel_id | SET NULL |
| esf7_shs_workload_rows | personnel_id | CASCADE |
| esf7_sned_sections | adviser_id | SET NULL |
| esf7_work_immersion | personnel_id | CASCADE |
| esf7_workload_rows | personnel_id | CASCADE |
| esf7_workload_transfer | absent_personnel_id | CASCADE |
| esf7_workload_transfer | relieving_personnel_id | CASCADE |
| overload_absences | personnel_id | CASCADE |
| overload_pay_and_reason | personnel_id | CASCADE |

The verify script rediscovers this list on every run; it does not use the table above.

```sql
SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
 WHERE c.confrelid = 'esf7_personnel_profile'::regclass AND c.contype = 'f'
 ORDER BY 1, 2;
```

## Insert order inside a school transaction
1. `esf7_personnel_profile` (parent of all FKs; `ON CONFLICT DO NOTHING`)
2. `esf7_personnel_employment`, `esf7_perssonel_educ`, `esf7_personnel_designations`
3. `esf7_workload_rows`, `esf7_admin_task`, `esf7_related_task`

Sections (`esf7_regular_sections`, `esf7_sned_sections`, `esf7_als_sections`) and `esf7_school_profile` / `esf7_school_node_status` are not written: the cache has no data for them. Their adviser FKs are `SET NULL` anyway.
Profile before children is what prevents FK failures on `personnel_id`.
