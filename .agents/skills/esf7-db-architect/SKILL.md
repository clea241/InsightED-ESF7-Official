---
name: esf7-db-architect
description: Master database schema agent for the insighted_esf7 PostgreSQL database. Holds complete knowledge of all active database tables, columns, data types, foreign key constraints, indexes, and migration rebuild sequences.
---

# ESF7 Database Architect Agent Skill

Master specification and schema management agent for the `insighted_esf7` PostgreSQL database.

## 🎯 Role & Capabilities

1. **Schema & Contract Knowledge**: Knows every table, column, data type, primary/foreign key constraint, index, and check constraint within `insighted_esf7`.
2. **Safe Migration & Drop Management**: Executes single-database isolated tear-downs and clean re-initializations of `insighted_esf7` without impacting surrounding databases (e.g. `insightEd`).
3. **Schema Verification & Drift Prevention**: Ensures newly added tables or columns remain synchronized with `server/schema.sql` and backend models.

---

## 📖 Database Schema Reference

Detailed technical schema definitions (all tables, columns, data types, FKs, and indexes) are maintained in:
* **[Database Schema Reference Document](file:///e:/InsightED%20-%20ESF7%20Official/.agents/skills/esf7-db-architect/references/database_schema_reference.md)**

---

## 🗄 Active Database Tables Summary

The `insighted_esf7` database currently contains **21 active tables**:

| # | Table Name | Purpose | Primary Key | Key Columns / Foreign Keys |
|---|------------|---------|-------------|----------------------------|
| 1 | `salary_matrix` | DepEd SSL Salary Grade (1-33, Steps 1-8) matrix | `id` (SERIAL) | `salary_grade`, `step_number`, `basic_salary`, `position_title` |
| 2 | `esf7_personnel_profile` | Personnel Identity & Personal tabs + Raw JSON Payload | `id` (VARCHAR(50)) | `prn`, `school_id`, `school_year`, `type`, `salutation`, `first_name`, `middle_name`, `last_name`, `name_extension`, `tin`, `no_tin`, `sex_at_birth`, `civil_status`, `solo_parent`, `religion`, `ethnic_group`, `birthdate`, `age`, `philsys_no`, `employee_no`, `deped_email`, `is_school_head`, `raw_payload` |
| 3 | `esf7_personnel_employment` | Personnel Employment & Teaching tab details & JSON arrays | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `position_category`, `position`, `step_increment`, `fund_source`, `nature_of_appointment`, `hiring_arrangement`, `deployment_status`, `assigned_schools` (JSONB), `grade_levels_taught` (JSONB), `first_service_date`, `last_promotion_date`, `new_station_date`, `last_lateral_movement_date`, `raw_payload` |
| 4 | `esf7_perssonel_educ` | Personnel Education & Eligibility tab details | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `college_degree`, `major`, `minor`, `post_graduate_degree`, `post_graduate_discipline`, `eligibility` (JSONB including RA 1080), `prc_specialization`, `raw_payload` |
| 5 | `esf7_personnel_ld_trainings` | Personnel L&D training rows (NEAP, TESDA NCs, Seminars) | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `training_type`, `title`, `conductor`, `start_date`, `end_date`, `days`, `total_hours`, `raw_payload` |
| 6 | `esf7_personnel_learning_areas` | Personnel Learning Area Matrix (Era & Subject grid map) | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `matrix_data` (JSONB), `raw_payload` |
| 7 | `esf7_personnel_designations` | Personnel Official Designations, SDS Approval & External `sds_confirmed` | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `designation_name`, `grade_level`, `subject_area`, `track`, `is_sds_approved`, `sds_confirmed`, `serialized_key`, `raw_payload` |
| 8 | `esf7_class_sections` | Organized Class Sections (Mono/Multigrade/Non-Graded/ARAL) + `standard` status | `id` (VARCHAR(50)) | `school_id`, `school_year`, `grade_level`, `section_name`, `section_type`, `advisor_id` (FK `esf7_personnel_profile.id`), `advisory_minutes`, `male_learners`, `female_learners`, `number_of_learners`, `standard`, `raw_payload` |
| 9 | `esf7_school_subjects` | Custom Added Subjects per school & key stage | `id` (VARCHAR(50)) | `school_id`, `school_year`, `subject_name`, `key_stage`, `grade_level`, `shs_category`, `is_custom`, `is_active`, `raw_payload` |
| 10 | `esf7_workload_rows` | Elementary & JHS Workload Schedules | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year`, `grade_level`, `section_id` (FK `esf7_class_sections.id`), `section_name`, `subject`, `subject_id`, `remediation_subject`, `start_time`, `end_time`, `days`, `raw_payload` |
| 11 | `esf7_shs_workload_rows` | Senior High School Workload Schedules (1st, 2nd, 3rd Terms) | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year`, `term`, `semester`, `grade_level`, `track_strand`, `shs_subject_category`, `section_id`, `section_name`, `subject`, `subject_id`, `start_time`, `end_time`, `days`, `raw_payload` |
| 12 | `esf7_personnel_allowances` | Personnel Allowances (PERA, Uniform, Supplies, Medical, Hardship) | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year`, `has_pera`, `pera_amount`, `has_uniform`, `uniform_amount`, `has_supplies`, `supplies_amount`, `has_medical`, `medical_amount`, `has_hardship`, `hardship_amount`, `raw_payload` |
| 13 | `overload_no_work` | Local Holidays & Class Suspensions (Regional, Division, School-specific) | `id` (VARCHAR(50)) | `region`, `division`, `school_id`, `school_year`, `no_work_date`, `event_type`, `title`, `raw_payload` |
| 14 | `overload_absences` | Teacher Absences (Single date / date range) for Overload Pay Deductions | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year`, `start_date`, `end_date`, `leave_type`, `total_days`, `raw_payload` |
| 15 | `esf7_workload_transfer` | Relieving Duty / Temporary Workload Transfer between Teachers | `id` (VARCHAR(50)) | `school_id`, `school_year`, `absent_personnel_id` (FK), `relieving_personnel_id` (FK), `absence_id` (FK), `workload_id`, `workload_type`, `subject`, `start_date`, `end_date`, `relieving_hours`, `raw_payload` |
| 16 | `overload_late` | Teacher Tardiness Logs for Single-Day Overload Pay Disqualification | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year`, `tardiness_date` |
| 17 | `esf7_work_immersion` | SHS Work Immersion Coordinator Daily Venue Visit Schedules | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year`, `visit_date`, `start_time`, `end_time`, `duration_minutes`, `raw_payload` |
| 18 | `overload_pay_and_reason` | Overload Hours, Pay Amount, Net Term Pay, and Reasons JSONB Array | `id` (VARCHAR(50)) | `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year`, `term`, `month`, `overload_hours`, `overload_pay`, `net_term_pay`, `reasons` (JSONB), `raw_payload` |
| 19 | `esf7_requests` | Request Center (Inter-School Clustered Teacher, Reassigned Teacher, Merger Requests) | `id` (VARCHAR(50)) | `requester_school_id`, `target_school_id`, `school_year`, `request_type`, `personnel_id` (FK), `personnel_name`, `status`, `remarks`, `raw_payload` |
| 20 | `esf7_school_profile` | School Profile (Elementary, JHS, JHS JSONB Special Programs, SHS Curriculum Model) | `id` (VARCHAR(50)) | `school_id`, `school_year`, `has_elem_special_programs`, `has_jhs_special_programs`, `jhs_special_programs` (JSONB), `shs_curriculum_model`, `raw_payload` |
| 21 | `esf7_submission_queue` | Submission Queue (Offline-First Certified E-Sign Submissions) | `id` (SERIAL) | `school_id`, `school_year`, `payload` (JSONB), `signature`, `certified_by`, `status`, `error_message`, `raw_payload` |

---

## 🔄 Execution Workflow for Table Creation & Resets

1. **Step 1: Execute Table Creation Scripts**:
   * `node server/create_esf7_personnel_profile_table.js`
   * `node server/create_esf7_personnel_employment_table.js`
   * `node server/create_esf7_personnel_educ_table.js`
   * `node server/create_esf7_personnel_ld_trainings_table.js`
   * `node server/create_esf7_personnel_learning_areas_table.js`
   * `node server/create_esf7_personnel_designations_table.js`
   * `node server/create_esf7_class_sections_table.js`
   * `node server/create_esf7_school_subjects_table.js`
   * `node server/create_esf7_workload_tables.js`
   * `node server/create_esf7_personnel_allowances_table.js`
   * `node server/create_overload_no_work_table.js`
   * `node server/create_overload_absences_and_transfer_tables.js`
   * `node server/create_overload_late_table.js`
   * `node server/create_esf7_work_immersion_table.js`
   * `node server/create_overload_pay_and_reason_table.js`
   * `node server/create_esf7_requests_table.js`
   * `node server/create_esf7_school_profile_table.js`
   * `node server/create_esf7_submission_queue_table.js`
2. **Step 2: Verify Active Tables**:
   * Query `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`.
