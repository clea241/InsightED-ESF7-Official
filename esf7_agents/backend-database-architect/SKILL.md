---
name: backend-database-architect
description: Master agent skill for InsightED ESF7 Backend API architecture, Express route dispatching, database field-level verification, controller validation, queue worker ingestion, and PostgreSQL data persistence testing.
---

# Backend & Database Architect Agent Skill

Master architect for the `InsightED - ESF7 Official` backend server, API routing system, and PostgreSQL field-level data verification.

## 🎯 Role & Capabilities

1. **Backend & Route Architecture**:
   - Master knowledge of `server/server.js`, Express middlewares, CORS, and 30+ modular controllers in `server/controllers/`.
   - Verifies route mappings, aliases, error handling, parameter sanitation, and HTTP status codes.
2. **Database Field Integrity & Persistence Testing**:
   - Verifies that all 21 PostgreSQL tables store incoming JSON/REST payloads accurately without data truncation or type coercion errors.
   - Audits `raw_payload` JSONB columns, foreign key cascade deletions, unique composite constraints, and indexing.
3. **Queue Worker & Batch Ingestion**:
   - Manages and tests `server/queue_worker.js` for offline-first submission queue processing (`esf7_submission_queue`), transactions (`BEGIN` / `COMMIT` / `ROLLBACK`), and error trapping.
4. **Data Verification & Test Automation**:
   - Authors and executes targeted DB verification scripts (`test_*_api.js`, `check_db.js`, `verify_autofill_results.js`) to validate end-to-end data pipelines.

---

## 🗄 Core Database Table Surface (21 Tables)

| # | Table Name | Key Storage Fields | Verification Focus |
|---|------------|--------------------|-------------------|
| 1 | `salary_matrix` | `salary_grade`, `step_number`, `basic_salary` | DepEd SSL Steps 1-8 lookup |
| 2 | `esf7_personnel_profile` | `id`, `prn`, `school_id`, `school_year`, `salutation`, `first_name`, `last_name`, `deped_email`, `is_school_head`, `raw_payload` | PRN uniqueness, DepEd email validation, School Head single flag |
| 3 | `esf7_personnel_employment` | `position`, `step_increment`, `fund_source`, `nature_of_appointment`, `assigned_schools` (JSONB), `grade_levels_taught` (JSONB) | JSONB array storage, date fields, FK cascade |
| 4 | `esf7_perssonel_educ` | `highest_educational_attainment`, `college_degree`, `major`, `minor`, `post_graduate_degree`, `eligibility` (JSONB) | JSONB eligibility array, degree fields |
| 5 | `esf7_personnel_ld_trainings` | `training_type` (NEAP/TESDA/OTHER), `title`, `conductor`, `days`, `total_hours` | Type check constraint, hours numeric |
| 6 | `esf7_personnel_learning_areas` | `matrix_data` (JSONB), `raw_payload` | Era grid subject mapping JSONB |
| 7 | `esf7_personnel_designations` | `designation_name`, `grade_level`, `subject_area`, `is_sds_approved`, `sds_confirmed`, `serialized_key` | SDS approval flags, serialized keys |
| 8 | `esf7_regular_sections` / `esf7_aral_sections` / `esf7_remedial_enrichment_sections` | `grade_level`, `section_name`, `male_learners`, `female_learners`, `number_of_learners`, `adviser_id` | Learner sums, adviser foreign keys |
| 9 | `esf7_school_subjects` | `subject_name`, `key_stage`, `grade_level`, `shs_category`, `is_custom` | Unique constraint per school/SY/stage |
| 10 | `esf7_workload_rows` | `grade_level`, `section_id`, `subject`, `start_time`, `end_time`, `days` (JSONB) | Elementary/JHS schedule time slots & days JSONB |
| 11 | `esf7_shs_workload_rows` | `term` (1st, 2nd, 3rd), `grade_level`, `track_strand`, `subject`, `start_time`, `end_time`, `days` (JSONB) | SHS 3-Term isolation, time ranges |
| 12 | `esf7_personnel_allowances` | `has_pera`, `has_uniform`, `has_supplies`, `has_medical`, `has_hardship`, amounts | Boolean toggles & default DepEd allowance amounts |
| 13 | `overload_no_work` | `region`, `division`, `school_id`, `no_work_date`, `event_type`, `title` | Holiday/suspension date deductions |
| 14 | `overload_absences` | `start_date`, `end_date`, `leave_type`, `total_days` | Sick/maternity leave date deductions |
| 15 | `esf7_workload_transfer` | `absent_personnel_id`, `relieving_personnel_id`, `relieving_hours`, `start_date`, `end_date` | Relieving duty hours calculation |
| 16 | `overload_late` | `tardiness_date`, `school_id`, `school_year` | Single-day overload disqualification |
| 17 | `esf7_work_immersion` | `visit_date`, `start_time`, `end_time`, `duration_minutes` | Immersion venue coordinator visits |
| 18 | `overload_pay_and_reason` | `term`, `month`, `overload_hours`, `overload_pay`, `net_term_pay`, `reasons` (JSONB) | Computed PHTR overload pay & reason log |
| 19 | `esf7_requests` | `requester_school_id`, `target_school_id`, `request_type`, `personnel_id`, `status` | Clustered/reassigned teacher workflows |
| 20 | `esf7_school_profile` | `has_elem_special_programs`, `has_jhs_special_programs`, `jhs_special_programs` (JSONB), `shs_curriculum_model` | Curricular program flags & model |
| 21 | `esf7_submission_queue` | `payload` (JSONB), `signature`, `certified_by`, `status`, `error_message` | Offline queue ingestion worker |

---

## 🛠 Testing & Verification Workflow

1. **Step 1: Database Health & Table Structure Check**
   - Run verification scripts to confirm all 21 tables, constraints, indexes, and ENUM/CHECK values exist.
2. **Step 2: Controller Endpoint Audits**
   - Verify each controller's `GET`, `POST`, `PUT`, `DELETE` handlers against input payloads.
   - Ensure all request body keys map 1:1 to database columns or `raw_payload`.
3. **Step 3: Ingestion & Transaction Integrity**
   - Test transactional batch saves, rollbacks upon error, and foreign key cascade rules.
4. **Step 4: Queue Worker Stress & Edge Case Testing**
   - Submit offline queue batches to `esf7_submission_queue` and verify the background worker processes them to `completed` status with full relational population.
