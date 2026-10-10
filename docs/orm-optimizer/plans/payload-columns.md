# Duplicated JSON payload check (database `esf7_local`, read-only)

Schema: `server/drizzle/schema.ts` (38 JSON/JSONB columns, 23 payload-style). Sizes are bytes from `pg_column_size` on 1000+ row tables; overlap is by key name only. Row contents are never printed or saved.

| table.column | verdict | rows | avg / max col bytes | avg rest-of-row | payload % of row | heap / TOAST / total MB | typed-column overlap | EXPLAIN read payload vs baseline (ms, shared read; first N rows, N in json) | reason |
|---|---|---|---|---|---|---|---|---|---|
| esf7_personnel_employment.raw_payload | Rejected | 381146 | 4007 / 11643 | 200 | 95% | 159.9 / 1643 / 1893 | 6832/125445 keys, 5% of bytes | 1313.389 vs 12.497 ms, 5552 vs 735 | only 5% of payload bytes duplicate typed columns; the payload mostly holds data with no column |
| esf7_personnel_extra_tasks.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_personnel_profile.raw_payload | Rejected | 386978 | 3502 / 10803 | 217 | 94% | 201.9 / 1422.9 / 1697.5 | 7568/99523 keys, 8% of bytes | 1727.537 vs 4.826 ms, 6620 vs 0 | only 8% of payload bytes duplicate typed columns; the payload mostly holds data with no column |
| esf7_perssonel_educ.raw_payload | Rejected | 382415 | 4015 / 12888 | 249 | 94% | 177.8 / 1644.2 / 1916.3 | 4301/129758 keys, 9% of bytes | 1366.675 vs 3.088 ms, 6133 vs 0 | only 9% of payload bytes duplicate typed columns; the payload mostly holds data with no column |
| esf7_personnel_ld_trainings.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_remedial_enrichment_sections.raw_payload | Static only | 1 | 436 / 436 | 163 | 73% | 0 / 0 / 0.1 | 8/15 keys, 65% of bytes | n/a | only 1 rows (1 non-null) locally; too few to measure |
| esf7_link.preview_data | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_personnel_learning_areas.matrix_data | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_personnel_learning_areas.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_personnel_designations.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_room_submissions_staging.profile_data | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_shs_workload_rows.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_aral_sections.raw_payload | Static only | 1 | 576 / 576 | 175 | 77% | 0 / 0 / 0.1 | 9/21 keys, 61% of bytes | n/a | only 1 rows (1 non-null) locally; too few to measure |
| esf7_personnel_submission.payload_json | Rejected | 11117 | 4814 / 12966 | 144 | 97% | 11 / 259.9 / 280.2 | 838/127196 keys, 1% of bytes | 1187.654 vs 3.166 ms, 0 vs 0 | only 1% of payload bytes duplicate typed columns; the payload mostly holds data with no column |
| esf7_workload_transfer.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| overload_absences.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| overload_pay_and_reason.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_school_subjects.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| overload_no_work.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_submission_queue.payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_submission_queue.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| esf7_work_immersion.raw_payload | Static only | 0 | 0 / 0 | 0 | 0% | 0 / 0 / 0 | 0/0 keys, 0% of bytes | n/a | only 0 rows (0 non-null) locally; too few to measure |
| school_drafts.payload | Rejected | 14954 | 106723 / 3304278 | 56 | 100% | 1.7 / 1585.3 / 1605.5 | 0/2084 keys, 0% of bytes | 1181.526 vs 0.17 ms, 0 vs 0 | only 0% of payload bytes duplicate typed columns; the payload mostly holds data with no column |

15 small array/scalar JSON columns (days, *_programs, reasons, ...) were checked and set aside as not payloads.

Dup keys (examples) and payload-only keys per column are in `payload-columns.json`.

_Reading the column is what EXPLAIN shows; each insert or update must also write those same bytes (heap/TOAST plus WAL). The write cost is therefore estimated from the average column bytes, not timed._
