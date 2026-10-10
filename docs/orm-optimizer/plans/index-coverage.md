# Index coverage (database `esf7_local`, read-only catalog queries)

Schema file: `server/drizzle/schema.ts` (32 tables, 102 declared indexes). Live: 162 indexes on 53 tables. Stats reset: never/unknown.
Largest tables (live rows): esf7_workload_rows=651940, esf7_personnel_profile=386978, esf7_perssonel_educ=382415, esf7_personnel_employment=381146, esf7_personnel_node_status=142381.

## Missing-index candidates (column used at a query site, no live index leads with it)

| table | column | used in | live rows | priority | sites |
|---|---|---|---|---|---|
| esf7_personnel_profile | is_school_head | where-eq | 386978 | check | server/controllers/personnel/index.js:3105, server/controllers/personnel/index.js:3671, server/controllers/school_head_sdo/index.js:82 |
| esf7_regular_sections | grade_level | orderBy/where-eq | 139797 | check | server/controllers/class_sections/index.js:274, server/controllers/class_sections/index.js:504 |
| esf7_regular_sections | section_name | where-eq | 139797 | check | server/controllers/class_sections/index.js:504 |
| esf7_regular_sections | created_at | orderBy | 139797 | check | server/controllers/class_sections/index.js:504 |
| esf7_personnel_allowances | school_year | where-eq | 63980 | check | server/controllers/allowances/index.js:282 |
| esf7_admin_task | created_at | orderBy | 15313 | check | server/controllers/personnel/index.js:2593 |
| school_drafts | updated_at | orderBy | 14954 | check | server/controllers/reports/esf7_xlsb.js:90, server/controllers/reports/index.js:473 |
| school_drafts | school_year | where-eq | 14954 | check | server/controllers/schools/index.js:534, server/controllers/schools/index.js:1536, server/controllers/schools/index.js:1940 |
| esf7_school_profile | school_year | where-eq | 14804 | check | server/queue_worker.js:645 |
| esf7_personnel_submission | status | where-eq | 11040 | check | server/controllers/room_profiling/index.js:361 |
| esf7_personnel_submission | created_timestamp | orderBy | 11040 | check | server/controllers/room_profiling/index.js:361 |
| esf7_requests | request_type | where-eq | 3208 | low (small table) | server/controllers/requests/index.js:525 |
| esf7_requests | personnel_name | where-eq | 3208 | low (small table) | server/controllers/requests/index.js:525 |
| esf7_aral_sections | grade_level | orderBy | 1 | low (small table) | server/controllers/class_sections/index.js:286 |
| esf7_remedial_enrichment_sections | grade_level | orderBy | 1 | low (small table) | server/controllers/class_sections/index.js:290 |
| esf7_link | updated_at | orderBy | 0 | low (small table) | server/controllers/esf7_upload/index.js:214 |
| overload_pay_and_reason | school_year | where-eq | 0 | low (small table) | server/controllers/overload_reasons/index.js:22 |
| overload_pay_and_reason | term | where-eq | 0 | low (small table) | server/controllers/overload_reasons/index.js:22 |
| esf7_personnel_ld_trainings | created_at | orderBy | 0 | low (small table) | server/controllers/personnel/index.js:2562, server/controllers/personnel/index.js:3512, server/controllers/personnel/index.js:4168 (+1) |
| esf7_personnel_designations | created_at | orderBy | 0 | low (small table) | server/controllers/personnel/index.js:2566, server/controllers/personnel/index.js:3516, server/controllers/personnel/index.js:4178 (+3) |
| esf7_personnel_extra_tasks | created_at | orderBy | 0 | low (small table) | server/controllers/personnel_extra_tasks/index.js:48, server/controllers/personnel_extra_tasks/index.js:53 |
| esf7_personnel_extra_tasks | school_year | where-eq | 0 | low (small table) | server/controllers/personnel_extra_tasks/index.js:53 |
| esf7_school_subjects | is_active | where-eq | 0 | low (small table) | server/controllers/school_subjects/index.js:42 |
| esf7_school_subjects | created_at | orderBy | 0 | low (small table) | server/controllers/school_subjects/index.js:42 |
| esf7_shs_workload_rows | term | orderBy | 0 | low (small table) | server/controllers/shs_workload_rows/index.js:72 |
| esf7_submission_queue | created_at | orderBy | 0 | low (small table) | server/controllers/submissions/index.js:132 |
| esf7_work_immersion | school_year | where-eq | 0 | low (small table) | server/controllers/work_immersion/index.js:77 |

## Foreign keys without a supporting index (live)

_none_

## Drift: declared in schema.ts but missing live

| table | index |
|---|---|
| esf7_term_status | idx_esf7_term_status_school_sy |

## Drift: live but not declared in schema.ts

| table | index | columns |
|---|---|---|
| esf7_admin_task | idx_esf7_admin_task_dates | start_date, end_date |
| esf7_admin_task | idx_esf7_admin_task_school | school_id, school_year |
| esf7_personnel_allowances | idx_esf7_allowances_school_sy | school_id, school_year |
| esf7_aral_sections | idx_esf7_aral_sections_school_sy | school_id, school_year |
| esf7_personnel_designations | idx_esf7_personnel_designations_key_stage | key_stage |
| esf7_personnel_designations | idx_esf7_personnel_dsg_personnel | personnel_id |
| esf7_perssonel_educ | idx_esf7_perssonel_educ_college_degrees | college_degrees |
| esf7_perssonel_educ | idx_esf7_perssonel_educ_post_grad_disc | post_graduate_discipline |
| esf7_related_task | idx_esf7_related_task_school | school_id, school_year |
| esf7_workload_transfer | idx_esf7_workload_transfer_school_sy | school_id, school_year |
| esf7_personnel_submission | idx_pers_sub_school_personnel | school_id, personnel_id |

## Unused indexes (idx_scan = 0, not unique/primary)

| table | index | columns | size | table rows |
|---|---|---|---|---|
| esf7_workload_rows | idx_esf7_workload_rows_section | section_id | 10.8 MB | 651940 |
| esf7_perssonel_educ | idx_esf7_perssonel_educ_college_degrees | college_degrees | 1.7 MB | 382415 |
| esf7_perssonel_educ | idx_esf7_perssonel_educ_post_grad_disc | post_graduate_discipline | 3.5 MB | 382415 |
| esf7_personnel_allowances | idx_esf7_personnel_allowances_personnel | personnel_id | 2.2 MB | 63980 |
| schools_iern | idx_schools_iern_district | district | 0.4 MB | 46040 |
| schools_iern | idx_schools_iern_region | region | 0.3 MB | 46040 |
| esf7_personnel_submission_archive | idx_pers_archive_school | school_id | 0.3 MB | 41821 |
| esf7_personnel_submission_archive | idx_pers_archive_personnel | school_id, personnel_id | 1.7 MB | 41821 |
| esf7_related_task | idx_esf7_related_task_personnel | personnel_id | 0.4 MB | 15589 |
| esf7_admin_task | idx_esf7_admin_task_personnel | personnel_id | 0.2 MB | 15313 |
| esf7_school_node_status | idx_school_node_status_gin | personnel_summary, node_11_validation | 1.1 MB | 14950 |
| salary_matrix | idx_salary_matrix_lookup | salary_grade, step_number | 0.0 MB | 264 |
| esf7_database | idx_esf7_database_prn | prn | 0.0 MB | 91 |
| esf7_database | idx_esf7_database_employee_no | employee_no | 0.0 MB | 91 |
| esf7_validation | idx_esf7_validation_school_id | school_id | 0.0 MB | 27 |
| esf7_aral_sections | idx_aral_sections_tutor | tutor_id | 0.0 MB | 1 |
| esf7_remedial_enrichment_sections | idx_remedial_sections_teacher | assigned_teacher_id | 0.0 MB | 1 |
| esf7_school_subjects | idx_esf7_school_subjects_school_sy | school_id, school_year | 0.0 MB | 0 |
| esf7_shs_workload_rows | idx_esf7_shs_workload_rows_personnel | personnel_id | 0.0 MB | 0 |
| overload_no_work | idx_overload_no_work_region_div | region, division | 0.0 MB | 0 |
| overload_late_undertime | idx_late_undertime_lookup | school_id, school_year, personnel_id | 0.0 MB | 0 |
| esf7_personnel_designations | idx_esf7_personnel_designations_key_stage | key_stage | 0.0 MB | 0 |
| esf7_submission_queue | idx_esf7_submission_queue_school_sy | school_id, school_year | 0.0 MB | 0 |
| esf7_personnel_designations | idx_esf7_personnel_dsg_personnel | personnel_id | 0.0 MB | 0 |
| esf7_personnel_ld_trainings | idx_esf7_personnel_ld_trainings_type | training_type | 0.0 MB | 0 |
| esf7_work_immersion | idx_esf7_work_immersion_personnel | personnel_id | 0.0 MB | 0 |
| esf7_work_immersion | idx_esf7_work_immersion_date | visit_date | 0.0 MB | 0 |
| overload_pay_and_reason | idx_overload_pay_reason_personnel | personnel_id | 0.0 MB | 0 |
| esf7_workload_transfer | idx_esf7_workload_transfer_absence | absence_id | 0.0 MB | 0 |
| esf7_workload_transfer | idx_esf7_workload_transfer_absent | absent_personnel_id | 0.0 MB | 0 |
| esf7_workload_transfer | idx_esf7_workload_transfer_relieving | relieving_personnel_id | 0.0 MB | 0 |
| esf7_personnel_extra_tasks | idx_extra_tasks_personnel | personnel_id | 0.0 MB | 0 |
| overload_late_undertime | idx_late_undertime_date | log_date | 0.0 MB | 0 |
| overload_absences | idx_overload_absences_dates | start_date, end_date | 0.0 MB | 0 |
| overload_absences | idx_overload_absences_personnel | personnel_id | 0.0 MB | 0 |
| overload_no_work | idx_overload_no_work_date | no_work_date | 0.0 MB | 0 |
| overload_pay_and_reason | idx_overload_pay_reason_term_month | personnel_id, school_year, term, month | 0.0 MB | 0 |
| esf7_deleted_personnel | idx_esf7_del_pers_prn | prn | 0.0 MB | 0 |
| esf7_database_dummy | esf7_database_dummy_schoool_id_idx | schoool_id | 0.0 MB | 0 |
| esf7_database_dummy | esf7_database_dummy_prn_idx | prn | 0.0 MB | 0 |
| esf7_database_dummy | esf7_database_dummy_employee_no_idx | employee_no | 0.0 MB | 0 |

## Duplicate or redundant indexes

| table | index | overlaps with | columns | kind |
|---|---|---|---|---|
| esf7_personnel_submission_archive | idx_pers_archive_school | idx_pers_archive_personnel | school_id ⊂ school_id, personnel_id | redundant (prefix of another index) |
| esf7_personnel_learning_areas | esf7_personnel_learning_areas_personnel_id_key | idx_esf7_personnel_learning_areas_personnel | personnel_id | duplicate |
| esf7_personnel_designations | idx_esf7_personnel_designations_personnel | idx_esf7_personnel_dsg_personnel | personnel_id | duplicate |
| esf7_personnel_profile | esf7_personnel_profile_prn_key | idx_esf7_personnel_profile_prn | prn | duplicate |
| esf7_regular_sections | idx_regular_sections_school_sy | uq_regular_section_school_sy | school_id, school_year ⊂ school_id, school_year, grade_level, section_name | redundant (prefix of another index) |
| esf7_aral_sections | idx_aral_sections_school_sy | idx_esf7_aral_sections_school_sy | school_id, school_year | duplicate |
| esf7_sned_sections | idx_sned_sections_school_sy | uq_sned_section_school_sy | school_id, school_year ⊂ school_id, school_year, section_name | redundant (prefix of another index) |
| esf7_als_sections | idx_als_sections_school_sy | uq_als_section_school_sy | school_id, school_year ⊂ school_id, school_year, section_name | redundant (prefix of another index) |
| esf7_school_subjects | idx_esf7_school_subjects_school_sy | uq_school_sy_custom_subject | school_id, school_year ⊂ school_id, school_year, key_stage, subject_name | redundant (prefix of another index) |
| esf7_room_roster_cache | esf7_room_roster_cache_pkey | idx_room_roster_cache_school | school_id | duplicate |
| esf7_shs_workload_rows | idx_esf7_shs_workload_rows_personnel | idx_esf7_shs_workload_rows_term | personnel_id ⊂ personnel_id, term | redundant (prefix of another index) |
| esf7_personnel_allowances | idx_esf7_personnel_allowances_personnel | uq_personnel_sy_allowances | personnel_id ⊂ personnel_id, school_year | redundant (prefix of another index) |
| esf7_validation | esf7_validation_pkey | idx_esf7_validation_school_id | school_id | duplicate |
| esf7_work_immersion | idx_esf7_work_immersion_personnel | uq_personnel_sy_immersion_date | personnel_id ⊂ personnel_id, school_year, visit_date | redundant (prefix of another index) |
| overload_no_work | idx_overload_no_work_region_div | uq_region_div_school_date | region, division ⊂ region, division, school_id, school_year, no_work_date | redundant (prefix of another index) |
| overload_late_undertime | idx_late_undertime_lookup | uq_late_undertime_record | school_id, school_year, personnel_id ⊂ school_id, school_year, personnel_id, log_date | redundant (prefix of another index) |
| overload_pay_and_reason | uq_personnel_sy_term_month_overload | idx_overload_pay_reason_term_month | personnel_id, school_year, term, month | duplicate |
| overload_pay_and_reason | idx_overload_pay_reason_personnel | uq_personnel_sy_term_month_overload | personnel_id ⊂ personnel_id, school_year, term, month | redundant (prefix of another index) |
| overload_pay_and_reason | idx_overload_pay_reason_personnel | idx_overload_pay_reason_term_month | personnel_id ⊂ personnel_id, school_year, term, month | redundant (prefix of another index) |
| esf7_personnel_node_status | pk_esf7_personnel_node_status | idx_personnel_node_status_lookup | school_id, school_year, personnel_id | duplicate |
| esf7_school_node_status | pk_esf7_school_node_status | idx_school_node_status_lookup | school_id, school_year | duplicate |
| salary_matrix | uq_salary_grade_step | idx_salary_matrix_lookup | salary_grade, step_number | duplicate |
| esf7_school_profile | uq_school_sy_profile | idx_esf7_school_profile_school_sy | school_id, school_year | duplicate |
| esf7_perssonel_educ | esf7_perssonel_educ_personnel_id_key | idx_esf7_perssonel_educ_personnel | personnel_id | duplicate |
| esf7_deleted_personnel | idx_esf7_del_pers_school | idx_esf7_del_pers_name | school_id ⊂ school_id, full_name_clean | redundant (prefix of another index) |
| esf7_personnel_employment | esf7_personnel_employment_personnel_id_key | idx_esf7_personnel_employment_personnel | personnel_id | duplicate |

## Tables with high sequential scan counts (>= 100 scans and >= 10000 rows)

| table | live rows | seq scans | seq tuples read | idx scans |
|---|---|---|---|---|
| esf7_workload_rows | 651940 | 276 | 61352144 | 678449 |
| esf7_personnel_employment | 381146 | 15330 | 9051156 | 442852 |
| esf7_personnel_profile | 386978 | 102 | 8003632 | 2364716 |
| esf7_regular_sections | 139797 | 5765 | 6534099 | 229521 |
| schools_iern | 46040 | 137 | 6307480 | 50 |
| esf7_perssonel_educ | 382415 | 15205 | 1561311 | 442906 |
| esf7_school_profile | 14804 | 208 | 1276151 | 44911 |
| esf7_migration_log | 14955 | 114 | 1235806 | 15039 |

_Counts are cumulative since the stats reset and reflect whatever workload ran on this local DB, not production traffic. Confirm any suspect with `explain-query.mjs` before reporting it as Verified._
