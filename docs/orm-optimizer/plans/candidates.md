# Candidate query sites (static, unverified)

Scanned 315 files under `InsightED-ESF7-Official`; schema: `server/drizzle/schema.ts` (32 tables parsed). Pooler hint in repo: no.
Every row is a **candidate**, not a conclusion. Nothing here is proven slow until EXPLAIN ANALYZE says so. `tier`: app = request-path code, script = one-off code.
One-off scripts excluded by default: **282 hits not listed** (rerun with `--include-scripts` to list them). By location: (top-level script files) (112), scratch (2), scripts (3), server/scratch (58), server/scripts (107).

## Grouped by pattern and file (106 groups, 193 sites)

| Group | Sites |
|---|---|
| select-all:server/controllers/personnel/index.js | 12 |
| payload-write-whole-body:server/controllers/personnel/index.js | 10 |
| select-all:server/controllers/class_sections/index.js | 7 |
| orderby-unindexed:server/controllers/personnel/index.js | 7 |
| select-all:server/controllers/workload_rows/index.js | 6 |
| write-in-loop:server/controllers/personnel/index.js | 5 |
| write-in-loop:server/controllers/schools/index.js | 5 |
| payload-write-whole-body:server/controllers/schools/index.js | 5 |
| orderby-unindexed:server/controllers/class_sections/index.js | 4 |
| payload-write-whole-body:server/controllers/class_sections/index.js | 4 |
| query-in-loop:server/controllers/overload_pay_and_reason/index.js | 3 |
| query-in-loop:server/controllers/overload_reasons/index.js | 3 |
| select-all:server/controllers/personnel_designations/index.js | 3 |
| orderby-unindexed:server/controllers/personnel_designations/index.js | 3 |
| select-all:server/controllers/reports/esf7_xlsb.js | 3 |
| payload-write-whole-body:server/controllers/room_profiling/index.js | 3 |
| payload-write-whole-body:server/controllers/workload_rows/index.js | 3 |
| write-in-loop:server/controllers/workload_rows/index.js | 3 |
| write-in-loop:server/controllers/class_sections/index.js | 2 |
| select-all:server/controllers/esf7_upload/index.js | 2 |
| payload-write-whole-body:server/controllers/overload_pay_and_reason/index.js | 2 |
| payload-write-whole-body:server/controllers/overload_reasons/index.js | 2 |
| select-all:server/controllers/personnel_extra_tasks/index.js | 2 |
| orderby-unindexed:server/controllers/personnel_extra_tasks/index.js | 2 |
| select-all:server/controllers/personnel_learning_areas/index.js | 2 |
| payload-write-whole-body:server/controllers/personnel_learning_areas/index.js | 2 |
| missing-limit:server/controllers/reports/esf7_xlsb.js | 2 |
| select-all:server/controllers/reports/index.js | 2 |
| select-all:server/controllers/room_profiling/index.js | 2 |
| select-all:server/controllers/work_immersion/index.js | 2 |
| payload-write-whole-body:server/controllers/work_immersion/index.js | 2 |
| duplicated-json-payload:esf7_personnel_learning_areas | 2 |
| duplicated-json-payload:esf7_submission_queue | 2 |
| query-in-loop:server/services/overloadSync.js | 2 |
| payload-write-whole-body:server/controllers/absences/index.js | 1 |
| select-all:server/controllers/allowances/index.js | 1 |
| query-in-loop:server/controllers/allowances/index.js | 1 |
| write-in-loop:server/controllers/allowances/index.js | 1 |
| select-all:server/controllers/dev_snapshot.js | 1 |
| orderby-unindexed:server/controllers/esf7_upload/index.js | 1 |
| select-all:server/controllers/node_status/index.js | 1 |
| payload-write-whole-body:server/controllers/overload_late_undertime/index.js | 1 |
| payload-write-whole-body:server/controllers/overload_no_work/index.js | 1 |
| select-all:server/controllers/overload_reasons/index.js | 1 |
| missing-limit:server/controllers/personnel_designations/index.js | 1 |
| payload-write-whole-body:server/controllers/personnel_designations/index.js | 1 |
| select-all:server/controllers/personnel_employment/index.js | 1 |
| payload-write-whole-body:server/controllers/personnel_employment/index.js | 1 |
| write-in-loop:server/controllers/personnel_extra_tasks/index.js | 1 |
| payload-write-whole-body:server/controllers/personnel_extra_tasks/index.js | 1 |
| select-all:server/controllers/personnel_qualifications/index.js | 1 |
| payload-write-whole-body:server/controllers/personnel_qualifications/index.js | 1 |
| select-all:server/controllers/personnel_trainings/index.js | 1 |
| orderby-unindexed:server/controllers/personnel_trainings/index.js | 1 |
| write-in-loop:server/controllers/personnel_trainings/index.js | 1 |
| payload-write-whole-body:server/controllers/personnel_trainings/index.js | 1 |
| orderby-unindexed:server/controllers/reports/esf7_xlsb.js | 1 |
| write-in-loop:server/controllers/reports/index.js | 1 |
| orderby-unindexed:server/controllers/reports/index.js | 1 |
| missing-limit:server/controllers/reports/index.js | 1 |
| select-all:server/controllers/requests/index.js | 1 |
| write-in-loop:server/controllers/room_profiling/index.js | 1 |
| query-in-loop:server/controllers/room_profiling/index.js | 1 |
| select-all:server/controllers/school_head_sdo/index.js | 1 |
| select-all:server/controllers/school_subjects/index.js | 1 |
| orderby-unindexed:server/controllers/school_subjects/index.js | 1 |
| payload-write-whole-body:server/controllers/school_subjects/index.js | 1 |
| query-in-loop:server/controllers/schools/index.js | 1 |
| select-all:server/controllers/shs_workload_rows/index.js | 1 |
| missing-limit:server/controllers/shs_workload_rows/index.js | 1 |
| orderby-unindexed:server/controllers/shs_workload_rows/index.js | 1 |
| payload-write-whole-body:server/controllers/shs_workload_rows/index.js | 1 |
| payload-write-whole-body:server/controllers/shs_workload_transfers/index.js | 1 |
| orderby-unindexed:server/controllers/submissions/index.js | 1 |
| select-all:server/controllers/validation/index.js | 1 |
| missing-limit:server/controllers/work_immersion/index.js | 1 |
| write-in-loop:server/controllers/work_immersion/index.js | 1 |
| query-in-loop:server/controllers/workload_rows/index.js | 1 |
| write-in-loop:server/controllers/workload_transfers/index.js | 1 |
| duplicated-json-payload:esf7_personnel_employment | 1 |
| duplicated-json-payload:esf7_personnel_extra_tasks | 1 |
| duplicated-json-payload:esf7_personnel_profile | 1 |
| duplicated-json-payload:esf7_perssonel_educ | 1 |
| duplicated-json-payload:esf7_personnel_ld_trainings | 1 |
| duplicated-json-payload:esf7_remedial_enrichment_sections | 1 |
| duplicated-json-payload:esf7_link | 1 |
| duplicated-json-payload:esf7_personnel_designations | 1 |
| duplicated-json-payload:esf7_room_submissions_staging | 1 |
| duplicated-json-payload:esf7_shs_workload_rows | 1 |
| duplicated-json-payload:esf7_aral_sections | 1 |
| duplicated-json-payload:esf7_personnel_submission | 1 |
| duplicated-json-payload:esf7_workload_transfer | 1 |
| duplicated-json-payload:overload_absences | 1 |
| duplicated-json-payload:overload_pay_and_reason | 1 |
| duplicated-json-payload:esf7_school_subjects | 1 |
| duplicated-json-payload:overload_no_work | 1 |
| duplicated-json-payload:esf7_work_immersion | 1 |
| duplicated-json-payload:school_drafts | 1 |
| query-in-loop:server/middleware/auth.js | 1 |
| query-in-loop:server/queue_worker.js | 1 |
| missing-limit:server/queue_worker.js | 1 |
| query-in-loop:server/safe_truncate_esf7_tables.js | 1 |
| select-all:server/server.js | 1 |
| missing-limit:server/server.js | 1 |
| query-in-loop:server/server.js | 1 |
| missing-limit:server/services/overloadSync.js | 1 |

## All sites

| # | file:line | pattern | access_layer | tier | note | snippet |
|---|---|---|---|---|---|---|
| 1 | server/controllers/absences/index.js:161 | payload-write-whole-body | raw-pg | app | writes a whole request body into overload_absences.raw_payload | `INSERT INTO overload_absences (raw_payload) <- JSON.stringify(whole request body)` |
| 2 | server/controllers/allowances/index.js:172 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 3 | server/controllers/allowances/index.js:203 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const countRes = await db.query(` |
| 4 | server/controllers/allowances/index.js:209 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const insertRes = await db.query(` |
| 5 | server/controllers/class_sections/index.js:274 | select-all | raw-pg | app | SELECT * in raw SQL | `db.query(` |
| 6 | server/controllers/class_sections/index.js:274 | orderby-unindexed | raw-pg | app | ORDER BY esf7_regular_sections.grade_level: no index in schema.ts leads with this column | `db.query(` |
| 7 | server/controllers/class_sections/index.js:278 | select-all | raw-pg | app | SELECT * in raw SQL | `db.query(` |
| 8 | server/controllers/class_sections/index.js:282 | select-all | raw-pg | app | SELECT * in raw SQL | `db.query(` |
| 9 | server/controllers/class_sections/index.js:286 | select-all | raw-pg | app | SELECT * in raw SQL | `db.query(` |
| 10 | server/controllers/class_sections/index.js:286 | orderby-unindexed | raw-pg | app | ORDER BY esf7_aral_sections.grade_level: no index in schema.ts leads with this column | `db.query(` |
| 11 | server/controllers/class_sections/index.js:290 | select-all | raw-pg | app | SELECT * in raw SQL | `db.query(` |
| 12 | server/controllers/class_sections/index.js:290 | orderby-unindexed | raw-pg | app | ORDER BY esf7_remedial_enrichment_sections.grade_level: no index in schema.ts leads with this column | `db.query(` |
| 13 | server/controllers/class_sections/index.js:497 | select-all | raw-pg | app | SELECT * in raw SQL | `await client.query(` |
| 14 | server/controllers/class_sections/index.js:504 | select-all | raw-pg | app | SELECT * in raw SQL | `await client.query(` |
| 15 | server/controllers/class_sections/index.js:504 | orderby-unindexed | raw-pg | app | ORDER BY esf7_regular_sections.created_at: no index in schema.ts leads with this column | `await client.query(` |
| 16 | server/controllers/class_sections/index.js:732 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await dbPool.query(` |
| 17 | server/controllers/class_sections/index.js:856 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_sned_sections.raw_payload | `INSERT INTO esf7_sned_sections (raw_payload) <- JSON.stringify(whole request body)` |
| 18 | server/controllers/class_sections/index.js:979 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_als_sections.raw_payload | `INSERT INTO esf7_als_sections (raw_payload) <- JSON.stringify(whole request body)` |
| 19 | server/controllers/class_sections/index.js:1096 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_aral_sections.raw_payload | `INSERT INTO esf7_aral_sections (raw_payload) <- JSON.stringify(whole request body)` |
| 20 | server/controllers/class_sections/index.js:1222 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_remedial_enrichment_sections.raw_payload | `INSERT INTO esf7_remedial_enrichment_sections (raw_payload) <- JSON.stringify(whole request body)` |
| 21 | server/controllers/class_sections/index.js:1457 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await dbPool.query(` |
| 22 | server/controllers/dev_snapshot.js:20 | select-all | raw-pg | app | SELECT * in raw SQL | `const profileRes = await db.query(` |
| 23 | server/controllers/esf7_upload/index.js:214 | orderby-unindexed | raw-pg | app | ORDER BY esf7_link.updated_at: no index in schema.ts leads with this column | `const queueRes = await pool.query(` |
| 24 | server/controllers/esf7_upload/index.js:365 | select-all | raw-pg | app | SELECT * in raw SQL | `let sourceRes = await pool.query(` |
| 25 | server/controllers/esf7_upload/index.js:371 | select-all | raw-pg | app | SELECT * in raw SQL | `sourceRes = await pool.query(` |
| 26 | server/controllers/node_status/index.js:260 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 27 | server/controllers/overload_late_undertime/index.js:299 | payload-write-whole-body | raw-pg | app | writes a whole object variable into overload_late_undertime.raw_payload | `INSERT INTO overload_late_undertime (raw_payload) <- JSON.stringify(whole object variable)` |
| 28 | server/controllers/overload_no_work/index.js:145 | payload-write-whole-body | raw-pg | app | writes a whole request body into overload_no_work.raw_payload | `INSERT INTO overload_no_work (raw_payload) <- JSON.stringify(whole request body)` |
| 29 | server/controllers/overload_pay_and_reason/index.js:181 | payload-write-whole-body | raw-pg | app | writes a whole request body into overload_pay_and_reason.raw_payload | `INSERT INTO overload_pay_and_reason (raw_payload) <- JSON.stringify(whole request body)` |
| 30 | server/controllers/overload_pay_and_reason/index.js:230 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const personRes = await db.query(` |
| 31 | server/controllers/overload_pay_and_reason/index.js:242 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const countRes = await db.query(` |
| 32 | server/controllers/overload_pay_and_reason/index.js:276 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const result = await db.query(sql, [` |
| 33 | server/controllers/overload_pay_and_reason/index.js:276 | payload-write-whole-body | raw-pg | app | writes a whole object variable into overload_pay_and_reason.raw_payload | `INSERT INTO overload_pay_and_reason (raw_payload) <- JSON.stringify(whole object variable)` |
| 34 | server/controllers/overload_reasons/index.js:22 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 35 | server/controllers/overload_reasons/index.js:175 | payload-write-whole-body | raw-pg | app | writes a whole request body into overload_pay_and_reason.raw_payload | `INSERT INTO overload_pay_and_reason (raw_payload) <- JSON.stringify(whole request body)` |
| 36 | server/controllers/overload_reasons/index.js:228 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const personRes = await db.query(` |
| 37 | server/controllers/overload_reasons/index.js:240 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const countRes = await db.query(` |
| 38 | server/controllers/overload_reasons/index.js:274 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const result = await db.query(sql, [` |
| 39 | server/controllers/overload_reasons/index.js:274 | payload-write-whole-body | raw-pg | app | writes a whole object variable into overload_pay_and_reason.raw_payload | `INSERT INTO overload_pay_and_reason (raw_payload) <- JSON.stringify(whole object variable)` |
| 40 | server/controllers/personnel_designations/index.js:36 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 41 | server/controllers/personnel_designations/index.js:36 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_designations.created_at: no index in schema.ts leads with this column | `const result = await db.query(` |
| 42 | server/controllers/personnel_designations/index.js:50 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 43 | server/controllers/personnel_designations/index.js:50 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_designations.created_at: no index in schema.ts leads with this column | `const result = await db.query(` |
| 44 | server/controllers/personnel_designations/index.js:63 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 45 | server/controllers/personnel_designations/index.js:63 | missing-limit | raw-pg | app | raw SELECT with no WHERE and no LIMIT | `const result = await db.query(` |
| 46 | server/controllers/personnel_designations/index.js:63 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_designations.created_at: no index in schema.ts leads with this column | `const result = await db.query(` |
| 47 | server/controllers/personnel_designations/index.js:190 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_personnel_designations.raw_payload | `INSERT INTO esf7_personnel_designations (raw_payload) <- JSON.stringify(whole request body)` |
| 48 | server/controllers/personnel_employment/index.js:169 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 49 | server/controllers/personnel_employment/index.js:312 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_personnel_employment.raw_payload | `INSERT INTO esf7_personnel_employment (raw_payload) <- JSON.stringify(whole request body)` |
| 50 | server/controllers/personnel_extra_tasks/index.js:48 | select-all | raw-pg | app | SELECT * in raw SQL | `result = await db.query(` |
| 51 | server/controllers/personnel_extra_tasks/index.js:48 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_extra_tasks.created_at: no index in schema.ts leads with this column | `result = await db.query(` |
| 52 | server/controllers/personnel_extra_tasks/index.js:53 | select-all | raw-pg | app | SELECT * in raw SQL | `result = await db.query(` |
| 53 | server/controllers/personnel_extra_tasks/index.js:53 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_extra_tasks.created_at: no index in schema.ts leads with this column | `result = await db.query(` |
| 54 | server/controllers/personnel_extra_tasks/index.js:106 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const insertRes = await db.query(` |
| 55 | server/controllers/personnel_extra_tasks/index.js:106 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_extra_tasks.raw_payload | `INSERT INTO esf7_personnel_extra_tasks (raw_payload) <- JSON.stringify(whole object variable)` |
| 56 | server/controllers/personnel_learning_areas/index.js:27 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 57 | server/controllers/personnel_learning_areas/index.js:136 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_learning_areas.matrix_data | `INSERT INTO esf7_personnel_learning_areas (matrix_data) <- JSON.stringify(whole object variable)` |
| 58 | server/controllers/personnel_learning_areas/index.js:162 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 59 | server/controllers/personnel_learning_areas/index.js:252 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_learning_areas.matrix_data | `INSERT INTO esf7_personnel_learning_areas (matrix_data) <- JSON.stringify(whole object variable)` |
| 60 | server/controllers/personnel_qualifications/index.js:302 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 61 | server/controllers/personnel_qualifications/index.js:477 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_perssonel_educ.raw_payload | `INSERT INTO esf7_perssonel_educ (raw_payload) <- JSON.stringify(whole request body)` |
| 62 | server/controllers/personnel_trainings/index.js:39 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 63 | server/controllers/personnel_trainings/index.js:39 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_ld_trainings.created_at: no index in schema.ts leads with this column | `const result = await db.query(` |
| 64 | server/controllers/personnel_trainings/index.js:113 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const result = await client.query(` |
| 65 | server/controllers/personnel_trainings/index.js:113 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_ld_trainings.raw_payload | `INSERT INTO esf7_personnel_ld_trainings (raw_payload) <- JSON.stringify(whole object variable)` |
| 66 | server/controllers/personnel/index.js:1704 | select-all | raw-pg | app | SELECT * in raw SQL | `let result = await db.query(` |
| 67 | server/controllers/personnel/index.js:2489 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await db.query(` |
| 68 | server/controllers/personnel/index.js:2511 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 69 | server/controllers/personnel/index.js:2562 | select-all | raw-pg | app | SELECT * in raw SQL | `const trRes = await db.query(` |
| 70 | server/controllers/personnel/index.js:2562 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_ld_trainings.created_at: no index in schema.ts leads with this column | `const trRes = await db.query(` |
| 71 | server/controllers/personnel/index.js:2566 | select-all | raw-pg | app | SELECT * in raw SQL | `const dsgRes = await db.query(` |
| 72 | server/controllers/personnel/index.js:2566 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_designations.created_at: no index in schema.ts leads with this column | `const dsgRes = await db.query(` |
| 73 | server/controllers/personnel/index.js:2593 | select-all | raw-pg | app | SELECT * in raw SQL | `const admRes = await db.query(` |
| 74 | server/controllers/personnel/index.js:2593 | orderby-unindexed | raw-pg | app | ORDER BY esf7_admin_task.created_at: no index in schema.ts leads with this column | `const admRes = await db.query(` |
| 75 | server/controllers/personnel/index.js:2642 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 76 | server/controllers/personnel/index.js:2642 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_ld_trainings.raw_payload | `INSERT INTO esf7_personnel_ld_trainings (raw_payload) <- JSON.stringify(whole object variable)` |
| 77 | server/controllers/personnel/index.js:2680 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_learning_areas.matrix_data | `INSERT INTO esf7_personnel_learning_areas (matrix_data) <- JSON.stringify(whole object variable)` |
| 78 | server/controllers/personnel/index.js:2947 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 79 | server/controllers/personnel/index.js:3203 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_personnel_profile.raw_payload | `INSERT INTO esf7_personnel_profile (raw_payload) <- JSON.stringify(whole request body)` |
| 80 | server/controllers/personnel/index.js:3307 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_personnel_employment.raw_payload | `INSERT INTO esf7_personnel_employment (raw_payload) <- JSON.stringify(whole request body)` |
| 81 | server/controllers/personnel/index.js:3432 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_perssonel_educ.raw_payload | `INSERT INTO esf7_perssonel_educ (raw_payload) <- JSON.stringify(whole request body)` |
| 82 | server/controllers/personnel/index.js:3466 | select-all | raw-pg | app | SELECT * in raw SQL | `const completeRes = await db.query(` |
| 83 | server/controllers/personnel/index.js:3512 | select-all | raw-pg | app | SELECT * in raw SQL | `const trRes = await db.query(` |
| 84 | server/controllers/personnel/index.js:3512 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_ld_trainings.created_at: no index in schema.ts leads with this column | `const trRes = await db.query(` |
| 85 | server/controllers/personnel/index.js:3516 | select-all | raw-pg | app | SELECT * in raw SQL | `const dsgRes = await db.query(` |
| 86 | server/controllers/personnel/index.js:3516 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_designations.created_at: no index in schema.ts leads with this column | `const dsgRes = await db.query(` |
| 87 | server/controllers/personnel/index.js:3685 | select-all | raw-pg | app | SELECT * in raw SQL | `const currentRes = await client.query(` |
| 88 | server/controllers/personnel/index.js:3884 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_personnel_profile.raw_payload | `UPDATE esf7_personnel_profile (raw_payload) <- JSON.stringify(whole request body)` |
| 89 | server/controllers/personnel/index.js:4010 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_personnel_employment.raw_payload | `INSERT INTO esf7_personnel_employment (raw_payload) <- JSON.stringify(whole request body)` |
| 90 | server/controllers/personnel/index.js:4135 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_perssonel_educ.raw_payload | `INSERT INTO esf7_perssonel_educ (raw_payload) <- JSON.stringify(whole request body)` |
| 91 | server/controllers/personnel/index.js:4168 | select-all | raw-pg | app | SELECT * in raw SQL | `const trRes = await db.query(` |
| 92 | server/controllers/personnel/index.js:4168 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_ld_trainings.created_at: no index in schema.ts leads with this column | `const trRes = await db.query(` |
| 93 | server/controllers/personnel/index.js:4173 | select-all | raw-pg | app | SELECT * in raw SQL | `const laRes = await db.query(` |
| 94 | server/controllers/personnel/index.js:4178 | select-all | raw-pg | app | SELECT * in raw SQL | `const dsgRes = await db.query(` |
| 95 | server/controllers/personnel/index.js:4178 | orderby-unindexed | raw-pg | app | ORDER BY esf7_personnel_designations.created_at: no index in schema.ts leads with this column | `const dsgRes = await db.query(` |
| 96 | server/controllers/personnel/index.js:4480 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await pool.query(` |
| 97 | server/controllers/personnel/index.js:4480 | payload-write-whole-body | raw-pg | app | writes a whole object variable into school_drafts.payload | `UPDATE school_drafts (payload) <- JSON.stringify(whole object variable)` |
| 98 | server/controllers/personnel/index.js:4533 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await pool.query(` |
| 99 | server/controllers/personnel/index.js:4533 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_room_roster_cache.roster_json | `UPDATE esf7_room_roster_cache (roster_json) <- JSON.stringify(whole object variable)` |
| 100 | server/controllers/reports/esf7_xlsb.js:90 | orderby-unindexed | raw-pg | app | ORDER BY school_drafts.updated_at: no index in schema.ts leads with this column | `? await db.query(` |
| 101 | server/controllers/reports/esf7_xlsb.js:107 | select-all | raw-pg | app | SELECT * in raw SQL | `const schoolRes = await db.query("SELECT * FROM schools LIMIT 1");` |
| 102 | server/controllers/reports/esf7_xlsb.js:110 | select-all | raw-pg | app | SELECT * in raw SQL | `const pRes = await db.query('` |
| 103 | server/controllers/reports/esf7_xlsb.js:110 | missing-limit | raw-pg | app | raw SELECT with no WHERE and no LIMIT | `const pRes = await db.query('` |
| 104 | server/controllers/reports/esf7_xlsb.js:124 | select-all | raw-pg | app | SELECT * in raw SQL | `const wRes = await db.query('` |
| 105 | server/controllers/reports/esf7_xlsb.js:124 | missing-limit | raw-pg | app | raw SELECT with no WHERE and no LIMIT | `const wRes = await db.query('` |
| 106 | server/controllers/reports/index.js:207 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 107 | server/controllers/reports/index.js:473 | orderby-unindexed | raw-pg | app | ORDER BY school_drafts.updated_at: no index in schema.ts leads with this column | `const draftRes = await db.query(` |
| 108 | server/controllers/reports/index.js:509 | select-all | raw-pg | app | SELECT * in raw SQL | `const schoolRes = await db.query(` |
| 109 | server/controllers/reports/index.js:515 | select-all | raw-pg | app | SELECT * in raw SQL | `const personnelRes = await db.query(` |
| 110 | server/controllers/reports/index.js:515 | missing-limit | raw-pg | app | raw SELECT with no WHERE and no LIMIT | `const personnelRes = await db.query(` |
| 111 | server/controllers/requests/index.js:525 | select-all | raw-pg | app | SELECT * in raw SQL | `const checkDup = await db.query(` |
| 112 | server/controllers/room_profiling/index.js:318 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_personnel_submission.payload_json | `INSERT INTO esf7_personnel_submission (payload_json) <- JSON.stringify(whole request body)` |
| 113 | server/controllers/room_profiling/index.js:413 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await db.query(` |
| 114 | server/controllers/room_profiling/index.js:486 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const res = await client.query(sql, flatParams);` |
| 115 | server/controllers/room_profiling/index.js:1661 | select-all | raw-pg | app | SELECT * in raw SQL | `const { rows: subRows } = await db.query(` |
| 116 | server/controllers/room_profiling/index.js:1795 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_profiling_snapshots.snapshot_json | `INSERT INTO esf7_profiling_snapshots (snapshot_json) <- JSON.stringify(whole object variable)` |
| 117 | server/controllers/room_profiling/index.js:1838 | select-all | raw-pg | app | SELECT * in raw SQL | `const { rows } = await db.query(` |
| 118 | server/controllers/room_profiling/index.js:1892 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_room_roster_cache.roster_json | `INSERT INTO esf7_room_roster_cache (roster_json) <- JSON.stringify(whole object variable)` |
| 119 | server/controllers/school_head_sdo/index.js:35 | select-all | raw-pg | app | SELECT * in raw SQL | `const r = await db.query(` |
| 120 | server/controllers/school_subjects/index.js:42 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 121 | server/controllers/school_subjects/index.js:42 | orderby-unindexed | raw-pg | app | ORDER BY esf7_school_subjects.created_at: no index in schema.ts leads with this column | `const result = await db.query(` |
| 122 | server/controllers/school_subjects/index.js:117 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_school_subjects.raw_payload | `INSERT INTO esf7_school_subjects (raw_payload) <- JSON.stringify(whole request body)` |
| 123 | server/controllers/schools/index.js:880 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await db.query(batchQuery, params).catch((err) => {` |
| 124 | server/controllers/schools/index.js:1147 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 125 | server/controllers/schools/index.js:1147 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_profile.raw_payload | `INSERT INTO esf7_personnel_profile (raw_payload) <- JSON.stringify(whole object variable)` |
| 126 | server/controllers/schools/index.js:1229 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 127 | server/controllers/schools/index.js:1229 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_employment.raw_payload | `INSERT INTO esf7_personnel_employment (raw_payload) <- JSON.stringify(whole object variable)` |
| 128 | server/controllers/schools/index.js:1278 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 129 | server/controllers/schools/index.js:1278 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_perssonel_educ.raw_payload | `INSERT INTO esf7_perssonel_educ (raw_payload) <- JSON.stringify(whole object variable)` |
| 130 | server/controllers/schools/index.js:1355 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 131 | server/controllers/schools/index.js:1435 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 132 | server/controllers/schools/index.js:1929 | payload-write-whole-body | raw-pg | app | writes a whole object variable into school_drafts.payload | `INSERT INTO school_drafts (payload) <- JSON.stringify(whole object variable)` |
| 133 | server/controllers/schools/index.js:1960 | payload-write-whole-body | raw-pg | app | writes a whole object variable into school_drafts.payload | `INSERT INTO school_drafts (payload) <- JSON.stringify(whole object variable)` |
| 134 | server/controllers/shs_workload_rows/index.js:72 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 135 | server/controllers/shs_workload_rows/index.js:72 | missing-limit | raw-pg | app | raw SELECT with no WHERE and no LIMIT | `const result = await db.query(` |
| 136 | server/controllers/shs_workload_rows/index.js:72 | orderby-unindexed | raw-pg | app | ORDER BY esf7_shs_workload_rows.term: no index in schema.ts leads with this column | `const result = await db.query(` |
| 137 | server/controllers/shs_workload_rows/index.js:171 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_shs_workload_rows.raw_payload | `INSERT INTO esf7_shs_workload_rows (raw_payload) <- JSON.stringify(whole request body)` |
| 138 | server/controllers/shs_workload_transfers/index.js:182 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_workload_transfer.raw_payload | `INSERT INTO esf7_workload_transfer (raw_payload) <- JSON.stringify(whole request body)` |
| 139 | server/controllers/submissions/index.js:132 | orderby-unindexed | raw-pg | app | ORDER BY esf7_submission_queue.created_at: no index in schema.ts leads with this column | `const result = await db.query(` |
| 140 | server/controllers/validation/index.js:49 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 141 | server/controllers/work_immersion/index.js:77 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 142 | server/controllers/work_immersion/index.js:95 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 143 | server/controllers/work_immersion/index.js:95 | missing-limit | raw-pg | app | raw SELECT with no WHERE and no LIMIT | `const result = await db.query(` |
| 144 | server/controllers/work_immersion/index.js:187 | payload-write-whole-body | raw-pg | app | writes a whole request body into esf7_work_immersion.raw_payload | `INSERT INTO esf7_work_immersion (raw_payload) <- JSON.stringify(whole request body)` |
| 145 | server/controllers/work_immersion/index.js:232 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const result = await db.query(` |
| 146 | server/controllers/work_immersion/index.js:232 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_work_immersion.raw_payload | `INSERT INTO esf7_work_immersion (raw_payload) <- JSON.stringify(whole object variable)` |
| 147 | server/controllers/workload_rows/index.js:124 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 148 | server/controllers/workload_rows/index.js:142 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 149 | server/controllers/workload_rows/index.js:208 | select-all | raw-pg | app | SELECT * in raw SQL | `const pageQuery = db.query(` |
| 150 | server/controllers/workload_rows/index.js:665 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_profile.raw_payload | `UPDATE esf7_personnel_profile (raw_payload) <- JSON.stringify(whole object variable)` |
| 151 | server/controllers/workload_rows/index.js:808 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const resRow = await client.query(insertQuery, insertValues);` |
| 152 | server/controllers/workload_rows/index.js:847 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 153 | server/controllers/workload_rows/index.js:847 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_shs_workload_rows.raw_payload | `INSERT INTO esf7_shs_workload_rows (raw_payload) <- JSON.stringify(whole object variable)` |
| 154 | server/controllers/workload_rows/index.js:933 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 155 | server/controllers/workload_rows/index.js:1042 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(` |
| 156 | server/controllers/workload_rows/index.js:1147 | select-all | raw-pg | app | SELECT * in raw SQL | `const existingRes = await db.query(` |
| 157 | server/controllers/workload_rows/index.js:1308 | payload-write-whole-body | raw-pg | app | writes a whole object variable into esf7_personnel_profile.raw_payload | `UPDATE esf7_personnel_profile (raw_payload) <- JSON.stringify(whole object variable)` |
| 158 | server/controllers/workload_rows/index.js:1375 | select-all | raw-pg | app | SELECT * in raw SQL | `? await db.query(` |
| 159 | server/controllers/workload_rows/index.js:1379 | select-all | raw-pg | app | SELECT * in raw SQL | `: await db.query(` |
| 160 | server/controllers/workload_transfers/index.js:84 | write-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const result = await client.query(` |
| 161 | server/drizzle/schema.ts:41 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_personnel_employment.raw_payload (jsonb)` |
| 162 | server/drizzle/schema.ts:85 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_personnel_extra_tasks.raw_payload (jsonb)` |
| 163 | server/drizzle/schema.ts:134 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_personnel_profile.raw_payload (jsonb)` |
| 164 | server/drizzle/schema.ts:178 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_perssonel_educ.raw_payload (jsonb)` |
| 165 | server/drizzle/schema.ts:266 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_personnel_ld_trainings.raw_payload (jsonb)` |
| 166 | server/drizzle/schema.ts:308 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_remedial_enrichment_sections.raw_payload (jsonb)` |
| 167 | server/drizzle/schema.ts:339 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_link.preview_data (jsonb)` |
| 168 | server/drizzle/schema.ts:357 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_personnel_learning_areas.matrix_data (jsonb)` |
| 169 | server/drizzle/schema.ts:358 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_personnel_learning_areas.raw_payload (jsonb)` |
| 170 | server/drizzle/schema.ts:414 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_personnel_designations.raw_payload (jsonb)` |
| 171 | server/drizzle/schema.ts:515 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_room_submissions_staging.profile_data (jsonb)` |
| 172 | server/drizzle/schema.ts:576 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_shs_workload_rows.raw_payload (jsonb)` |
| 173 | server/drizzle/schema.ts:622 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_aral_sections.raw_payload (jsonb)` |
| 174 | server/drizzle/schema.ts:658 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_personnel_submission.payload_json (jsonb)` |
| 175 | server/drizzle/schema.ts:784 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_workload_transfer.raw_payload (jsonb)` |
| 176 | server/drizzle/schema.ts:834 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `overload_absences.raw_payload (jsonb)` |
| 177 | server/drizzle/schema.ts:927 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `overload_pay_and_reason.raw_payload (jsonb)` |
| 178 | server/drizzle/schema.ts:984 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_school_subjects.raw_payload (jsonb)` |
| 179 | server/drizzle/schema.ts:1018 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `overload_no_work.raw_payload (jsonb)` |
| 180 | server/drizzle/schema.ts:1102 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_submission_queue.payload (jsonb)` |
| 181 | server/drizzle/schema.ts:1107 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_submission_queue.raw_payload (jsonb)` |
| 182 | server/drizzle/schema.ts:1244 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `esf7_work_immersion.raw_payload (jsonb)` |
| 183 | server/drizzle/schema.ts:1284 | duplicated-json-payload | drizzle | app | payload-style JSON column; check whether it re-stores fields that already have typed columns | `school_drafts.payload (jsonb)` |
| 184 | server/middleware/auth.js:123 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const r = await pool.query(` |
| 185 | server/queue_worker.js:524 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await client.query(batch.query, batch.values);` |
| 186 | server/queue_worker.js:2872 | missing-limit | raw-pg | app | raw SELECT with no WHERE and no LIMIT | `const smRes = await client.query(` |
| 187 | server/safe_truncate_esf7_tables.js:78 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const countRes = await client.query(` |
| 188 | server/server.js:321 | select-all | raw-pg | app | SELECT * in raw SQL | `const result = await db.query(` |
| 189 | server/server.js:321 | missing-limit | raw-pg | app | raw SELECT with no WHERE and no LIMIT | `const result = await db.query(` |
| 190 | server/server.js:649 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await db.pool.query("SELECT 1");` |
| 191 | server/services/overloadSync.js:22 | missing-limit | raw-pg | app | raw SELECT with no WHERE and no LIMIT | `const pRes = await db.query(` |
| 192 | server/services/overloadSync.js:348 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `const countRes = await db.query(` |
| 193 | server/services/overloadSync.js:374 | query-in-loop | raw-pg | app | query call lexically inside a loop/callback (N+1 candidate) | `await db.query(sql, [` |
