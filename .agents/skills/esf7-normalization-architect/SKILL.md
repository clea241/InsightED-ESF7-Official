---
name: esf7-normalization-architect
description: Master agent skill for the full eSF7 database disaggregation and normalization architecture from esf7_school_profile to esf7_personnel_allowances. Governs clean-slate rebuilds, zero raw_payload enforcement, slim extras JSONB architecture, multi-table section_id resolution, personnel profile foreign key linking, and compatibility alias views.
---

# ESF7 Normalization Architect Skill

Master architectural skill governing the systematic disaggregation, normalization, and relational linkage of DepEd Electronic School Form 7 (eSF7) data from `esf7_school_profile` through `esf7_personnel_allowances` within the `insighted_esf7` PostgreSQL database.

---

## 🚨 CRITICAL DATABASE INTEGRITY RULES (RULE #1)

1. **STRICT DB ISOLATION**:
   - All migrations, queries, and script executions are strictly confined to `insighted_esf7`.
   - **NEVER** touch, truncate, drop, or alter other cluster databases (`insightEd`, `STRIDE`, `OpDash`, `AGAP`, `dpa_database`, `hq_database`, `tlo_database`, `siif_database`, `users_database`, `chat_database`, `cloud_database`, `gmis_items`, `Infra_Database`, etc.).
2. **PROTECT OFFICIAL PRODUCTION TABLES**:
   - **NEVER** touch, drop, truncate, or overwrite the `esf7_database` table under any circumstance.
3. **PRESERVE SALARY MATRIX**:
   - **NEVER** truncate `salary_matrix` (or `esf7_salary_matrix`).

---

## 🏗 The Core Normalization Paradigm

### 1. Zero `raw_payload` + Slim `extras` JSONB
- **Rule**: No production eSF7 entity table may store bloated copies of entire draft objects or HTTP request bodies inside a `raw_payload` column.
- **Replacement**:
  - All standard domain attributes are stored in strictly typed columns (`VARCHAR`, `NUMERIC`, `BOOLEAN`, `DATE`, `TIME`).
  - An `extras JSONB NOT NULL DEFAULT '{}'::jsonb` column is maintained exclusively for unmapped, non-standard extension keys.

### 2. Clean Slate Rebuild Lifecycle
Every normalization step follows this deterministic 7-step sequence:
1. **Safety Backup**: Create a snapshot table named `<table_name>_backup_20261013`.
2. **Schema Modernization**:
   - `ALTER TABLE <table_name> ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;`
   - `ALTER TABLE <table_name> DROP COLUMN IF EXISTS raw_payload;`
3. **Data Ingestion / Disaggregation**: Keyset chunked extraction from `school_drafts` or mapped migration from legacy stores.
4. **Foreign Key Realignment**: Resolve temporary draft IDs (`PER-...`, `local-p-...`, `P-HARVEST-...`) to canonical `esf7_personnel_profile(id)`.
5. **Section Linkage**: Resolve polymorphic timetable assignments to authentic sections across regular, ALS, ARAL, and SNED tables.
6. **Compatibility Views**: Maintain singular/plural and alias views (e.g. `esf7_workload_row`, `esf7_personnel_designation`, `esf7_personnel_allowance`, `esf7_class_sections`).
7. **Verification**: Confirm 0 orphan keys, 0 view execution errors, exact row counts, and index coverage.

---

## 📚 Complete Table Normalization Journey (`esf7_school_profile` ➔ `esf7_personnel_allowances`)

### 1. `esf7_school_profile`
* **Purpose**: Master school identity, curricular classification, and administrative division assignment.
* **Key Columns**: `school_id`, `school_name`, `division`, `region`, `school_type`, `curricular_offering_classification` (MCOC), `school_head_id`, `status`.
* **Disaggregation Role**: Supplies `school_id` scoping for all child tables. Ensures division test account isolation and SDO test routing.

### 2. `esf7_personnel_profile`
* **Purpose**: Core identity, civil demographics, and DepEd employment identifiers for 351,762 school personnel.
* **Key Columns**: `id` (PK), `prn`, `school_id`, `school_year`, `type` (`TEACHING` / `NON-TEACHING`), `salutation`, `first_name`, `middle_name`, `last_name`, `name_extension`, `tin`, `no_tin`, `sex_at_birth`, `civil_status`, `solo_parent`, `religion`, `ethnic_group`, `birthdate`, `age`, `philsys_no`, `no_philsys`, `employee_no`, `deped_email`, `no_deped_email`, `allow_email_discrepancy`, `is_school_head`, `legacy_id`.
* **Normalization Crux**: Holds `legacy_id` (`PER-<school_id>-<idx>`, `local-p-...`, `P-HARVEST-...`), which serves as the bridge for linking all draft-originating child tables to canonical numeric/UUID profile IDs.

### 3. `esf7_personnel_employment`
* **Purpose**: Plantilla position titles, salary steps, service longevity, and deployment arrangement.
* **Key Columns**: `id` (PK), `personnel_id` (FK `esf7_personnel_profile.id`), `position_category`, `position`, `step_increment` (1–8), `fund_source` (`NATIONAL`, `LOCAL`, `SBFP` strictly for Cook), `nature_of_appointment`, `hiring_arrangement`, `deployment_status`, `first_service_date`, `last_promotion_date`, `new_station_date`, `last_lateral_movement_date`, `assigned_schools` (JSONB), `grade_levels_taught` (JSONB).

### 4. `esf7_personnel_educ`
* **Purpose**: Educational credentials, tertiary degrees, graduate disciplines, and civil/professional licenses.
* **Key Columns**: `id` (PK), `personnel_id` (FK `esf7_personnel_profile.id`), `college_degree`, `major`, `minor`, `post_graduate_degree`, `post_graduate_discipline`, `eligibility` (JSONB array, including PRC LET, PBET, Civil Service, RA 1080), `prc_specialization`, `extras`.
* **State**: `raw_payload` dropped; `extras` JSONB added; safety backup `esf7_personnel_educ_backup_20261013`.

### 5. `esf7_personnel_ld_trainings`
* **Purpose**: Learning & Development seminar and certification history.
* **Key Columns**: `id` (PK), `personnel_id` (FK `esf7_personnel_profile.id`), `training_type` (`NEAP ACCREDITED`, `TESDA NC`, `DIVISION / REGIONAL`), `title`, `conductor`, `start_date`, `end_date`, `days`, `total_hours`, `extras`.
* **State**: `raw_payload` dropped; `extras` JSONB added; safety backup `esf7_personnel_ld_trainings_backup_20261013`.

### 6. `esf7_personnel_learning_areas`
* **Purpose**: Learning Area competency matrix detailing subjects and curriculum eras taught.
* **Key Columns**: `id` (PK), `personnel_id` (FK `esf7_personnel_profile.id`), `matrix_data` (JSONB grade-by-subject mapping), `school_year`, `extras`.
* **State**: `raw_payload` dropped; `extras` JSONB added; safety backup `esf7_personnel_learning_areas_backup_20261013`.

### 7. Section Tables Architecture
To enforce high-throughput, conflict-free section profiling, sections are specialized into 4 physical tables plus a unified polymorphic view:

#### A. `esf7_regular_sections` (175,239 rows)
* **Columns**: `id` (PK), `school_id`, `school_year`, `grade_level`, `section_name`, `section_type` (`MONO GRADE`, `MULTI GRADE`), `adviser_id` (FK `esf7_personnel_profile.id`), `male_learners`, `female_learners`, `number_of_learners`, `size_status`, `term`.
* **State**: `raw_payload` dropped; safety backup `esf7_regular_sections_backup_20261013`; alias view `esf7_regualar_sections` created to prevent typo regressions.

#### B. `esf7_als_sections` (655 rows)
* **Columns**: `id` (PK), `school_id`, `school_year`, `grade_level` (`ALS-ES`, `ALS-JHS`, `ALS-SHS`), `section_name`, `delivery_mode`, `clc_name`, `adviser_id`, learner counts.
* **State**: `raw_payload` dropped; safety backup `esf7_als_sections_backup_20261013`.

#### C. `esf7_aral_sections` (7,627 rows)
* **Columns**: `id` (PK), `school_id`, `school_year`, `basis_type`, `grade_level`, `assessment_tool`, `profile_level`, `section_name`, `tutor_id`, `total_learners`.
* **State**: `raw_payload` dropped; safety backup `esf7_aral_sections_backup_20261013`.

#### D. `esf7_sned_sections` (1,044 rows)
* **Columns**: `id` (PK), `school_id`, `school_year`, `grade_level` (`SNED-ES`, `SNED-JHS`), `section_name`, `program_type` (Autism, Hearing Impairment, ID, etc.), `adviser_id`, learner counts.
* **State**: `raw_payload` dropped; safety backup `esf7_sned_sections_backup_20261013`.

#### E. `esf7_class_sections` (Unified Compatibility View)
* **Definition**: Performs `UNION ALL` across `esf7_regular_sections`, `esf7_sned_sections`, `esf7_als_sections`, `esf7_aral_sections`, and `esf7_remedial_enrichment_sections`.
* **Critical Rule**: Must never query `raw_payload` so that view execution remains lightning fast and error-free.

### 8. `esf7_personnel_designations`
* **Purpose**: Official special designations (e.g. Department Head, TIC, Coordinator, Guidance, Property Custodian, Reading Coordinator).
* **Key Columns**: `id` (PK), `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year`, `designation_name`, `key_stage` (`KS1`, `KS2`, `KS3`, `KS4`), `grade_level`, `subject_area`, `track`, `is_sds_approved`, `sds_confirmed`, `serialized_key`, `extras`.
* **State**: `raw_payload` dropped; safety backup `esf7_personnel_designations_backup_20261013`; alias view `esf7_personnel_designation` created.

### 9. `esf7_workload_rows` (1,890,091 rows)
* **Purpose**: Timetable teaching blocks, advisory periods, and administrative/ancillary assignments.
* **Key Columns**: `id` (PK), `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year`, `grade_level`, `section_id`, `section_name`, `subject`, `subject_id`, `remediation_subject`, `start_time`, `end_time`, `days` (JSONB), `term`, `extras`.
* **Multi-Table `section_id` Connection**:
  - Re-anchored `section_id` away from placeholder spreadsheet draft IDs (`SEC-...`) into the authentic IDs of the 4 section tables:
    1. `esf7_regular_sections`: **618,392 rows** connected.
    2. `esf7_sned_sections`: **1,566 rows** connected.
    3. `esf7_als_sections`: **356 rows** connected.
    4. `esf7_aral_sections`: **2,219 rows** connected.
    - Total connected via `esf7_class_sections`: **622,533 rows**.
  - Optimized with functional index: `idx_wkl_school_sec_lower ON esf7_workload_rows (school_id, UPPER(TRIM(section_name)))`.
* **State**: `raw_payload` dropped; `extras` JSONB added; safety backup `esf7_workload_rows_backup_20261013_v2`; alias view `esf7_workload_row` created.

### 10. `esf7_personnel_allowances` (351,762 rows)
* **Purpose**: DepEd statutory employee benefits, uniform allowances, teaching supplies, medical benefits, and hardship allowances.
* **Key Columns**: `id` (PK), `personnel_id` (FK `esf7_personnel_profile.id`), `school_id`, `school_year` (`SY 26-27`), `has_pera`, `pera_amount` (2,000.00), `has_uniform`, `uniform_amount` (7,000.00), `has_supplies`, `supplies_amount` (10,000.00 for Teaching only; NULL for Non-Teaching), `has_medical`, `medical_amount` (7,000.00), `has_hardship`, `hardship_amount` (0.00), `disabled_allowances` (JSONB), `extras` (JSONB).
* **Parity & Integrity**:
  - Exactly 351,762 rows matching the 351,762 rows in `esf7_personnel_profile` (100% 1-to-1 coverage, 0 orphan records).
  - Mapped all 95,303 active customized records from legacy draft IDs to `esf7_personnel_profile(id)`.
  - Non-teaching personnel automatically excluded from Teaching Supplies Allowance.
* **State**: `raw_payload` dropped; `extras` JSONB added; safety backup `esf7_personnel_allowances_backup_20261013`; alias view `esf7_personnel_allowance` created.

---

## 🛠 Active Rebuild & Migration Scripts Registry

All normalization scripts reside in `server/scripts/` and can be re-run idempotently:

| Script Path | Purpose | Backup Table Created |
| :--- | :--- | :--- |
| `server/scripts/rebuild_regular_sections_from_drafts.js` | Rebuilds `esf7_regular_sections` | `esf7_regular_sections_backup_20261013` |
| `server/scripts/rebuild_special_sections_from_drafts.js` | Rebuilds ALS, ARAL, and SNED sections | `esf7_als/aral/sned_sections_backup_20261013` |
| `server/scripts/create_esf7_class_sections_view.js` | Generates clean `esf7_class_sections` view | N/A (View) |
| `server/scripts/rebuild_designations_from_drafts.js` | Rebuilds `esf7_personnel_designations` | `esf7_personnel_designations_backup_20261013` |
| `server/scripts/rebuild_workloads_from_drafts.js` | Rebuilds `esf7_workload_rows` from drafts | `esf7_workload_rows_backup_20261013_v2` |
| `server/scripts/link_workload_sections.js` | Links `section_id` to the 4 section tables | Functional Indexes |
| `server/scripts/rebuild_allowances_from_drafts.js` | Normalizes and maps `esf7_personnel_allowances` | `esf7_personnel_allowances_backup_20261013` |
| `server/scripts/sync_schema_to_local.js` | Clean-slate schema replication from `insighted_esf7` to `esf7_local` | Replaced 14 tables & 9 views |
| `server/scripts/sync_schema_to_staging.js` | Clean-slate schema replication from `insighted_esf7` to `insighted_esf7_staging` | Replaced 14 tables & 9 views |

---

## 🛡 Normalization Verification Checklist

When checking or extending normalized tables, execute these verification rules:

1. **Verify No `raw_payload`**:
   ```sql
   SELECT table_name, column_name 
   FROM information_schema.columns 
   WHERE table_name IN (
     'esf7_personnel_educ', 'esf7_personnel_ld_trainings', 'esf7_personnel_learning_areas',
     'esf7_regular_sections', 'esf7_als_sections', 'esf7_aral_sections', 'esf7_sned_sections',
     'esf7_personnel_designations', 'esf7_workload_rows', 'esf7_personnel_allowances'
   ) AND column_name = 'raw_payload';
   -- Must return 0 rows
   ```

2. **Verify `extras` JSONB Exists**:
   ```sql
   SELECT table_name, column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name IN (
     'esf7_personnel_educ', 'esf7_personnel_ld_trainings', 'esf7_personnel_learning_areas',
     'esf7_personnel_designations', 'esf7_workload_rows', 'esf7_personnel_allowances'
   ) AND column_name = 'extras';
   -- Must return all tables with data_type = 'jsonb'
   ```

3. **Verify Zero Orphan Profile Foreign Keys**:
   ```sql
   SELECT count(*) FROM esf7_personnel_allowances a
   LEFT JOIN esf7_personnel_profile p ON a.personnel_id = p.id
   WHERE p.id IS NULL;
   -- Must return 0
   ```

4. **Verify Workload Section Connection**:
   ```sql
   SELECT count(*) FROM esf7_workload_rows w
   JOIN esf7_class_sections cs ON w.section_id = cs.id;
   -- Must be >= 622,533
   ```
