-- PostgreSQL Schema for InsightED eSF7 (Alphanumeric String IDs PK Architecture)

-- 1. Salary Matrix Table (DepEd SSL Salary Grades 1-33, Steps 1-8)
CREATE TABLE IF NOT EXISTS salary_matrix (
    id SERIAL PRIMARY KEY,
    salary_grade INTEGER NOT NULL,
    step_number INTEGER NOT NULL,
    basic_salary NUMERIC(10,2) NOT NULL,
    position_title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_salary_grade_step UNIQUE (salary_grade, step_number)
);
CREATE INDEX IF NOT EXISTS idx_salary_matrix_lookup ON salary_matrix (salary_grade, step_number);

-- 2. Personnel Profile Table (Identity & Personal Tabs + Raw JSON Payload)
CREATE TABLE IF NOT EXISTS esf7_personnel_profile (
    id VARCHAR(50) PRIMARY KEY,
    prn TEXT UNIQUE NOT NULL,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'teaching' CHECK (type IN ('teaching', 'teaching-related', 'non-teaching')),
    
    -- IDENTITY TAB COLUMNS
    salutation TEXT NOT NULL DEFAULT 'MR.',
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    name_extension TEXT,
    tin TEXT,
    no_tin BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- PERSONAL TAB COLUMNS
    sex_at_birth TEXT CHECK (sex_at_birth IN ('Male', 'Female', 'MALE', 'FEMALE')),
    civil_status TEXT,
    solo_parent BOOLEAN NOT NULL DEFAULT FALSE,
    religion TEXT,
    ethnic_group TEXT,
    birthdate DATE,
    age INTEGER,
    philsys_no TEXT,
    no_philsys BOOLEAN NOT NULL DEFAULT FALSE,
    employee_no TEXT,
    deped_email TEXT,
    no_deped_email BOOLEAN NOT NULL DEFAULT FALSE,
    allow_email_discrepancy BOOLEAN NOT NULL DEFAULT FALSE,
    is_school_head BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- FLEXIBLE DATA STORAGE (JSONB)
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    -- TIMESTAMPTZ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_personnel_profile_school_sy ON esf7_personnel_profile (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_esf7_personnel_profile_prn ON esf7_personnel_profile (prn);

-- 3. Personnel Employment Table (Role, Appointment, Tenure & JSON Arrays)
CREATE TABLE IF NOT EXISTS esf7_personnel_employment (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL UNIQUE REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    
    position_category TEXT NOT NULL CHECK (position_category IN ('TEACHING', 'RELATED TEACHING', 'NON-TEACHING', 'teaching', 'teaching-related', 'non-teaching')),
    position TEXT NOT NULL,
    step_increment INTEGER DEFAULT 1 CHECK (step_increment BETWEEN 1 AND 8),
    fund_source TEXT NOT NULL,
    nature_of_appointment TEXT NOT NULL,
    hiring_arrangement TEXT NOT NULL,
    deployment_status TEXT DEFAULT 'OWN STATION',
    
    assigned_schools JSONB DEFAULT '[]'::jsonb,
    grade_levels_taught JSONB DEFAULT '[]'::jsonb,
    
    first_service_date DATE,
    last_promotion_date DATE,
    new_station_date DATE,
    last_lateral_movement_date DATE,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_personnel_employment_personnel ON esf7_personnel_employment (personnel_id);

-- 4. Personnel Education Table (Attainment, Track, Vocational, Degree, Postgraduate, Discipline & Eligibility JSONB)
CREATE TABLE IF NOT EXISTS esf7_perssonel_educ (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL UNIQUE REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    
    highest_educational_attainment TEXT NOT NULL DEFAULT 'COLLEGE GRADUATE / BACCALAUREATE',
    shs_track TEXT,
    vocational_course TEXT,
    vocational_level TEXT,
    college_degree TEXT,
    college_degrees JSONB DEFAULT '[]'::jsonb,
    major TEXT,
    minor TEXT,
    post_graduate_degree TEXT DEFAULT 'N/A',
    post_graduate_discipline JSONB DEFAULT '{}'::jsonb,
    
    eligibility JSONB DEFAULT '[]'::jsonb,
    prc_specialization TEXT,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_perssonel_educ_personnel ON esf7_perssonel_educ (personnel_id);

-- 5. Personnel L&D Trainings Table (NEAP, TESDA & Other Seminars / Certifications)
CREATE TABLE IF NOT EXISTS esf7_personnel_ld_trainings (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    
    training_type TEXT NOT NULL CHECK (training_type IN ('NEAP', 'TESDA', 'OTHER', 'neap', 'tesda', 'other')),
    title TEXT NOT NULL,
    conductor TEXT,
    start_date DATE,
    end_date DATE,
    days INTEGER,
    total_hours NUMERIC,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_personnel_ld_trainings_personnel ON esf7_personnel_ld_trainings (personnel_id);
CREATE INDEX IF NOT EXISTS idx_esf7_personnel_ld_trainings_type ON esf7_personnel_ld_trainings (training_type);

-- 6. Personnel Learning Area Matrix Table (Curriculum Era & Primary Subject Grid Map)
CREATE TABLE IF NOT EXISTS esf7_personnel_learning_areas (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL UNIQUE REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    
    matrix_data JSONB DEFAULT '{}'::jsonb,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_personnel_learning_areas_personnel ON esf7_personnel_learning_areas (personnel_id);

-- 7. Personnel Designations Table (Official Designations, SDS Approval & External sds_confirmed)
CREATE TABLE IF NOT EXISTS esf7_personnel_designations (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    
    designation_name TEXT NOT NULL,
    grade_level TEXT,
    subject_area TEXT,
    track TEXT,
    is_sds_approved BOOLEAN NOT NULL DEFAULT FALSE,
    sds_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    serialized_key TEXT NOT NULL,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_personnel_designations_personnel ON esf7_personnel_designations (personnel_id);

-- 7B. Teaching-Related Tasks Table (Extra Task Builder - Teaching Related)
CREATE TABLE IF NOT EXISTS esf7_related_task (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id VARCHAR(50) NOT NULL,
    school_year VARCHAR(20) NOT NULL DEFAULT '2026-2027',
    
    task_name TEXT NOT NULL,
    frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    term1_hours NUMERIC(6, 2) DEFAULT 0.00,
    is_designation_synced BOOLEAN DEFAULT FALSE,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_related_task_personnel ON esf7_related_task (personnel_id);
CREATE INDEX IF NOT EXISTS idx_esf7_related_task_school ON esf7_related_task (school_id, school_year);

-- 7C. Administrative Tasks Table (Extra Task Builder - Administrative Duties)
CREATE TABLE IF NOT EXISTS esf7_admin_task (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id VARCHAR(50) NOT NULL,
    school_year VARCHAR(20) NOT NULL DEFAULT '2026-2027',
    
    task_name TEXT NOT NULL,
    dates JSONB DEFAULT '[]'::jsonb,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_admin_task_personnel ON esf7_admin_task (personnel_id);
CREATE INDEX IF NOT EXISTS idx_esf7_admin_task_school ON esf7_admin_task (school_id, school_year);

-- 8A. Regular Base Sections Table (Official Base Enrollment)
CREATE TABLE IF NOT EXISTS esf7_regular_sections (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    
    grade_level TEXT NOT NULL,
    section_name TEXT NOT NULL,
    section_type TEXT NOT NULL DEFAULT 'MONO GRADE',
    
    adviser_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
    
    male_learners INTEGER DEFAULT 0,
    female_learners INTEGER DEFAULT 0,
    number_of_learners INTEGER DEFAULT 0,
    size_status TEXT DEFAULT 'WITHIN STANDARD',
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_regular_section_school_sy UNIQUE (school_id, school_year, grade_level, section_name)
);

CREATE INDEX IF NOT EXISTS idx_regular_sections_school_sy ON esf7_regular_sections (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_regular_sections_adviser ON esf7_regular_sections (adviser_id);

-- 8B. ARAL Sections Table (Academic Recovery & Accessible Learning - RA 12028)
CREATE TABLE IF NOT EXISTS esf7_aral_sections (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    
    basis_type TEXT NOT NULL DEFAULT 'grade',
    grade_level TEXT NOT NULL,
    assessment_tool TEXT,
    profile_level TEXT,
    section_name TEXT NOT NULL,
    
    tutor_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
    
    male_learners INTEGER DEFAULT 0,
    female_learners INTEGER DEFAULT 0,
    total_learners INTEGER DEFAULT 0,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aral_sections_school_sy ON esf7_aral_sections (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_aral_sections_tutor ON esf7_aral_sections (tutor_id);

-- 8C. Remedial & Enrichment Sections Table (School-Based Interventions)
CREATE TABLE IF NOT EXISTS esf7_remedial_enrichment_sections (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    
    intervention_type TEXT NOT NULL DEFAULT 'REMEDIAL',
    grade_level TEXT NOT NULL,
    section_name TEXT NOT NULL,
    
    assigned_teacher_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
    
    male_learners INTEGER DEFAULT 0,
    female_learners INTEGER DEFAULT 0,
    total_learners INTEGER DEFAULT 0,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remedial_sections_school_sy ON esf7_remedial_enrichment_sections (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_remedial_sections_teacher ON esf7_remedial_enrichment_sections (assigned_teacher_id);

-- 8D. SNED (Non-Graded) Sections Table (Special Needs Education)
CREATE TABLE IF NOT EXISTS esf7_sned_sections (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    
    grade_level TEXT NOT NULL DEFAULT 'SNED (NON-GRADED)',
    section_name TEXT NOT NULL,
    program_type TEXT,
    
    adviser_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
    
    male_learners INTEGER DEFAULT 0,
    female_learners INTEGER DEFAULT 0,
    number_of_learners INTEGER DEFAULT 0,
    
    size_status TEXT DEFAULT 'WITHIN STANDARD',
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_sned_section_school_sy UNIQUE (school_id, school_year, section_name)
);

CREATE INDEX IF NOT EXISTS idx_sned_sections_school_sy ON esf7_sned_sections (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_sned_sections_adviser ON esf7_sned_sections (adviser_id);

-- 8E. ALS Sections Table (Alternative Learning System)
CREATE TABLE IF NOT EXISTS esf7_als_sections (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    
    grade_level TEXT NOT NULL DEFAULT 'ALS',
    section_name TEXT NOT NULL,
    delivery_mode TEXT,
    clc_name TEXT,
    
    adviser_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
    
    male_learners INTEGER DEFAULT 0,
    female_learners INTEGER DEFAULT 0,
    number_of_learners INTEGER DEFAULT 0,
    
    size_status TEXT DEFAULT 'WITHIN STANDARD',
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_als_section_school_sy UNIQUE (school_id, school_year, section_name)
);

CREATE INDEX IF NOT EXISTS idx_als_sections_school_sy ON esf7_als_sections (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_als_sections_adviser ON esf7_als_sections (adviser_id);

-- 9. School Subjects Table (Stores Custom Added Subjects per School & Key Stage)
CREATE TABLE IF NOT EXISTS esf7_school_subjects (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    
    subject_name TEXT NOT NULL,
    key_stage TEXT NOT NULL,
    grade_level TEXT DEFAULT 'All',
    shs_category TEXT,
    
    is_custom BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_school_sy_custom_subject UNIQUE (school_id, school_year, key_stage, subject_name)
);

CREATE INDEX IF NOT EXISTS idx_esf7_school_subjects_school_sy ON esf7_school_subjects (school_id, school_year);

-- 10. Elementary & Junior High School Workload Rows Table
CREATE TABLE IF NOT EXISTS esf7_workload_rows (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    
    grade_level TEXT,
    section_id VARCHAR(50) REFERENCES esf7_class_sections(id) ON DELETE SET NULL,
    section_name TEXT,
    
    subject TEXT NOT NULL,
    subject_id VARCHAR(50),
    remediation_subject TEXT,
    
    start_time TIME,
    end_time TIME,
    days JSONB DEFAULT '["M","T","W","TH","F"]'::jsonb,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_workload_rows_personnel ON esf7_workload_rows (personnel_id);
CREATE INDEX IF NOT EXISTS idx_esf7_workload_rows_school_sy ON esf7_workload_rows (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_esf7_workload_rows_section ON esf7_workload_rows (section_id);

-- 11. Senior High School Workload Rows Table (1st, 2nd, 3rd Terms)
CREATE TABLE IF NOT EXISTS esf7_shs_workload_rows (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    
    term TEXT NOT NULL DEFAULT '1st',
    semester TEXT,
    
    grade_level TEXT NOT NULL,
    track_strand TEXT,
    shs_subject_category TEXT,
    section_id VARCHAR(50) REFERENCES esf7_class_sections(id) ON DELETE SET NULL,
    section_name TEXT,
    
    subject TEXT NOT NULL,
    subject_id VARCHAR(50),
    remediation_subject TEXT,
    
    start_time TIME,
    end_time TIME,
    days JSONB DEFAULT '["M","T","W","TH","F"]'::jsonb,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_shs_workload_rows_personnel ON esf7_shs_workload_rows (personnel_id);
CREATE INDEX IF NOT EXISTS idx_esf7_shs_workload_rows_term ON esf7_shs_workload_rows (personnel_id, term);
CREATE INDEX IF NOT EXISTS idx_esf7_shs_workload_rows_school_sy ON esf7_shs_workload_rows (school_id, school_year);

-- 12. Personnel Allowances Table (Boolean Flags & Amounts per Allowance)
CREATE TABLE IF NOT EXISTS esf7_personnel_allowances (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    
    has_pera BOOLEAN NOT NULL DEFAULT FALSE,
    pera_amount NUMERIC(10,2) DEFAULT 2000.00,
    
    has_uniform BOOLEAN NOT NULL DEFAULT FALSE,
    uniform_amount NUMERIC(10,2) DEFAULT 7000.00,
    
    has_supplies BOOLEAN NOT NULL DEFAULT FALSE,
    supplies_amount NUMERIC(10,2) DEFAULT 10000.00,
    
    has_medical BOOLEAN NOT NULL DEFAULT FALSE,
    medical_amount NUMERIC(10,2) DEFAULT 7000.00,
    
    has_hardship BOOLEAN NOT NULL DEFAULT FALSE,
    hardship_amount NUMERIC(10,2) DEFAULT 0.00,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_personnel_sy_allowances UNIQUE (personnel_id, school_year)
);

CREATE INDEX IF NOT EXISTS idx_esf7_personnel_allowances_personnel ON esf7_personnel_allowances (personnel_id);

-- 13. Overload No Work Table (Local Holidays & Class Suspensions for Overload Deductions)
CREATE TABLE IF NOT EXISTS overload_no_work (
    id VARCHAR(50) PRIMARY KEY,
    region TEXT NOT NULL,
    division TEXT NOT NULL,
    school_id TEXT NOT NULL DEFAULT 'ALL',
    school_year TEXT NOT NULL,
    
    no_work_date DATE NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_region_div_school_date UNIQUE (region, division, school_id, school_year, no_work_date)
);

CREATE INDEX IF NOT EXISTS idx_overload_no_work_region_div ON overload_no_work (region, division);
CREATE INDEX IF NOT EXISTS idx_overload_no_work_school ON overload_no_work (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_overload_no_work_date ON overload_no_work (no_work_date);

-- 14. Overload Absences Table (Teacher Absences for Overload Deductions)
CREATE TABLE IF NOT EXISTS overload_absences (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    leave_type TEXT NOT NULL DEFAULT 'SICK_LEAVE',
    total_days INTEGER DEFAULT 1,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overload_absences_personnel ON overload_absences (personnel_id);
CREATE INDEX IF NOT EXISTS idx_overload_absences_dates ON overload_absences (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_overload_absences_school_sy ON overload_absences (school_id, school_year);

-- 15. Workload Transfer Table (Relieving Duty / Temporary Workload Transfer)
CREATE TABLE IF NOT EXISTS esf7_workload_transfer (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    
    absent_personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    relieving_personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    
    absence_id VARCHAR(50) REFERENCES overload_absences(id) ON DELETE CASCADE,
    workload_id VARCHAR(50) NOT NULL,
    workload_type TEXT NOT NULL DEFAULT 'ELEM_JHS',
    subject TEXT NOT NULL,
    
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    relieving_hours NUMERIC(4,2) DEFAULT 1.00,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_workload_transfer_relieving ON esf7_workload_transfer (relieving_personnel_id);
CREATE INDEX IF NOT EXISTS idx_esf7_workload_transfer_absent ON esf7_workload_transfer (absent_personnel_id);
CREATE INDEX IF NOT EXISTS idx_esf7_workload_transfer_absence ON esf7_workload_transfer (absence_id);

-- 16. Overload Late & Undertime Table (Teacher Tardiness / Undertime DTR Logs)
CREATE TABLE IF NOT EXISTS overload_late_undertime (
    id                          TEXT PRIMARY KEY,
    school_id                   TEXT NOT NULL DEFAULT '108348',
    school_year                 TEXT NOT NULL DEFAULT '2026-2027',
    term                        TEXT DEFAULT '1st',
    month                       TEXT,
    personnel_id                TEXT NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    log_date                    DATE NOT NULL,
    time_in                     TEXT,
    time_out                    TEXT,
    late_minutes                INTEGER DEFAULT 0,
    undertime_minutes           INTEGER DEFAULT 0,
    total_dtr_deficit_minutes   INTEGER DEFAULT 0,
    scheduled_teaching_minutes  INTEGER DEFAULT 0,
    missed_teaching_minutes     INTEGER DEFAULT 0,
    actual_rendered_minutes     INTEGER DEFAULT 0,
    missed_slot_ids             JSONB DEFAULT '[]'::jsonb,
    log_type                    TEXT DEFAULT 'TARDINESS',
    reason                      TEXT,
    is_excused                  BOOLEAN DEFAULT FALSE,
    raw_payload                 JSONB DEFAULT '{}'::jsonb,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_late_undertime_record UNIQUE (school_id, school_year, personnel_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_late_undertime_lookup ON overload_late_undertime (school_id, school_year, personnel_id);
CREATE INDEX IF NOT EXISTS idx_late_undertime_date ON overload_late_undertime (log_date);

-- 17. Work Immersion Table (SHS Work Immersion Coordinator / Teacher Daily Venue Visit Schedules)
CREATE TABLE IF NOT EXISTS esf7_work_immersion (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    
    visit_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 0,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_personnel_sy_immersion_date UNIQUE (personnel_id, school_year, visit_date)
);

CREATE INDEX IF NOT EXISTS idx_esf7_work_immersion_personnel ON esf7_work_immersion (personnel_id);
CREATE INDEX IF NOT EXISTS idx_esf7_work_immersion_date ON esf7_work_immersion (visit_date);
CREATE INDEX IF NOT EXISTS idx_esf7_work_immersion_school_sy ON esf7_work_immersion (school_id, school_year);

-- 18. Overload Pay and Reason Table (Stores computed Overload Hours, Pay, Net Term Pay, and Reasons JSONB)
CREATE TABLE IF NOT EXISTS overload_pay_and_reason (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    
    term TEXT NOT NULL DEFAULT 'Term 1',
    month TEXT,
    
    overload_hours NUMERIC(6,2) DEFAULT 0.00,
    overload_pay NUMERIC(10,2) DEFAULT 0.00,
    net_term_pay NUMERIC(10,2) DEFAULT 0.00,
    
    reasons JSONB DEFAULT '[]'::jsonb,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_personnel_sy_term_month_overload UNIQUE (personnel_id, school_year, term, month)
);

CREATE INDEX IF NOT EXISTS idx_overload_pay_reason_personnel ON overload_pay_and_reason (personnel_id);
CREATE INDEX IF NOT EXISTS idx_overload_pay_reason_school_sy ON overload_pay_and_reason (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_overload_pay_reason_term_month ON overload_pay_and_reason (personnel_id, school_year, term, month);

-- 19. Requests Table (Inter-School Requests: Clustered Teacher, Reassigned Teacher, School Merger)
CREATE TABLE IF NOT EXISTS esf7_requests (
    id VARCHAR(50) PRIMARY KEY,
    requester_school_id TEXT NOT NULL,
    target_school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    
    request_type TEXT NOT NULL,
    personnel_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
    personnel_name TEXT,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'CANCELLED')),
    remarks TEXT,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_requests_target ON esf7_requests (target_school_id, status);
CREATE INDEX IF NOT EXISTS idx_esf7_requests_requester ON esf7_requests (requester_school_id, status);
CREATE INDEX IF NOT EXISTS idx_esf7_requests_personnel ON esf7_requests (personnel_id);

-- 20. School Profile Table (Stores Elementary, JHS, Special Programs, SHS Curriculum Model, and Inclusive Education Programs)
CREATE TABLE IF NOT EXISTS esf7_school_profile (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    
    -- Special Programs (SSES, SPA, SPFL, SPJ, SPS, STE, SPTVE)
    has_elem_special_programs BOOLEAN NOT NULL DEFAULT FALSE,
    elem_special_programs JSONB DEFAULT '[]'::jsonb,
    has_jhs_special_programs BOOLEAN NOT NULL DEFAULT FALSE,
    jhs_special_programs JSONB DEFAULT '[]'::jsonb,
    shs_curriculum_model TEXT,

    -- Inclusive Education Level Offerings (ALS, SNED, IPED, MADRASAH)
    has_elem_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
    elem_inclusive_programs JSONB DEFAULT '[]'::jsonb,
    has_jhs_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
    jhs_inclusive_programs JSONB DEFAULT '[]'::jsonb,
    has_shs_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
    shs_inclusive_programs JSONB DEFAULT '[]'::jsonb,
    
    -- Dedicated Program Boolean Flags
    has_als BOOLEAN NOT NULL DEFAULT FALSE,
    has_sned BOOLEAN NOT NULL DEFAULT FALSE,
    has_iped BOOLEAN NOT NULL DEFAULT FALSE,
    has_madrasah BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Aggregate Array of Active Inclusive Program Tags
    inclusive_programs JSONB DEFAULT '[]'::jsonb,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_school_sy_profile UNIQUE (school_id, school_year)
);

CREATE INDEX IF NOT EXISTS idx_esf7_school_profile_school_sy ON esf7_school_profile (school_id, school_year);

-- 21. Submission Queue Table (Offline-First Queue Processing for Certified E-Sign Submissions)
CREATE TABLE IF NOT EXISTS esf7_submission_queue (
    id SERIAL PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    signature TEXT,
    certified_by TEXT,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'CANCELLED')),
    error_message TEXT,
    
    raw_payload JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esf7_submission_queue_status_id ON esf7_submission_queue (status, id ASC);
CREATE INDEX IF NOT EXISTS idx_esf7_submission_queue_school_sy ON esf7_submission_queue (school_id, school_year);

-- 22. School Node Status Table (1 School = 1 Row Milestone Snapshots)
CREATE TABLE IF NOT EXISTS esf7_school_node_status (
    school_id VARCHAR(255) NOT NULL,
    school_year VARCHAR(50) NOT NULL DEFAULT 'SY 26-27',
    overall_status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS',
    overall_percentage INTEGER NOT NULL DEFAULT 0,
    
    node_01_school JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_02_roster JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_05_requests JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_06_classes JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_10_overload JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_11_validation JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    personnel_summary JSONB NOT NULL DEFAULT '{"total_personnel":0,"profiling_completed":0,"workload_completed":0,"all_personnel_ready":false}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT pk_esf7_school_node_status PRIMARY KEY (school_id, school_year)
);

CREATE INDEX IF NOT EXISTS idx_school_node_status_lookup ON esf7_school_node_status (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_school_node_status_overall ON esf7_school_node_status (overall_status);
CREATE INDEX IF NOT EXISTS idx_school_node_status_gin ON esf7_school_node_status USING GIN (personnel_summary, node_11_validation);

-- 23. Personnel Node Status Table (1 Personnel = 1 Row Teacher Milestones)
CREATE TABLE IF NOT EXISTS esf7_personnel_node_status (
    school_id VARCHAR(255) NOT NULL,
    school_year VARCHAR(50) NOT NULL DEFAULT 'SY 26-27',
    personnel_id VARCHAR(255) NOT NULL,
    personnel_name TEXT NOT NULL,
    position_title TEXT DEFAULT '',
    category VARCHAR(50) DEFAULT 'TEACHING',
    is_school_head BOOLEAN DEFAULT false,
    is_complete BOOLEAN DEFAULT false,
    
    node_03_room_qr JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_04_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_07_designation JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_08_workload JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_09_allowances JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT pk_esf7_personnel_node_status PRIMARY KEY (school_id, school_year, personnel_id)
);

CREATE INDEX IF NOT EXISTS idx_personnel_node_status_lookup ON esf7_personnel_node_status (school_id, school_year, personnel_id);
CREATE INDEX IF NOT EXISTS idx_personnel_node_status_complete ON esf7_personnel_node_status (school_id, is_complete);

-- 24. DepEd Schools Reference Table (synced from users_database)
CREATE TABLE IF NOT EXISTS schools_iern (
    school_id VARCHAR(50) PRIMARY KEY,
    school_name VARCHAR(255),
    region VARCHAR(100),
    division VARCHAR(150),
    district VARCHAR(150),
    is_testaccount BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_iern_region ON schools_iern(region);
CREATE INDEX IF NOT EXISTS idx_schools_iern_division ON schools_iern(division);
CREATE INDEX IF NOT EXISTS idx_schools_iern_district ON schools_iern(district);

-- 25. Real-Time School Node Progress Boolean View
DROP VIEW IF EXISTS vw_esf7_school_node_progress CASCADE;
CREATE OR REPLACE VIEW vw_esf7_school_node_progress AS
SELECT
    s.school_id,
    COALESCE(i.school_name, s.school_id)                              AS school_name,
    i.region,
    i.division,
    i.district,
    s.school_year,
    CASE
      WHEN (
        COALESCE((s.node_01_school->>'status') = 'COMPLETED', false) AND
        COALESCE((s.node_02_roster->>'status') = 'COMPLETED', false) AND
        COALESCE((s.node_06_classes->>'status') = 'COMPLETED', false) AND
        COALESCE((s.node_11_validation->>'status') = 'COMPLETED', false) AND
        COALESCE((s.personnel_summary->>'all_personnel_ready')::boolean, false)
      ) THEN 'COMPLETED'
      WHEN s.overall_percentage > 0 THEN 'IN_PROGRESS'
      ELSE 'NOT_STARTED'
    END                                                               AS overall_status,
    s.overall_percentage,
    
    COALESCE((s.node_01_school->>'status') = 'COMPLETED', false)      AS is_node_01_school_completed,
    COALESCE((s.node_02_roster->>'status') = 'COMPLETED', false)      AS is_node_02_roster_completed,
    COALESCE((s.node_05_requests->>'status') = 'COMPLETED', false)    AS is_node_05_requests_completed,
    COALESCE((s.node_06_classes->>'status') = 'COMPLETED', false)     AS is_node_06_classes_completed,
    COALESCE((s.node_10_overload->>'status') = 'COMPLETED', false)    AS is_node_10_overload_completed,
    COALESCE((s.node_11_validation->>'status') = 'COMPLETED', false)  AS is_node_11_validation_completed,

    COALESCE((s.personnel_summary->>'all_personnel_ready')::boolean, false) AS is_all_personnel_completed,
    COALESCE((s.personnel_summary->>'total_personnel')::int, 0)             AS total_personnel_count,
    COALESCE((s.personnel_summary->>'profiling_completed')::int, 0)         AS profiling_completed_count,
    COALESCE((s.personnel_summary->>'workload_completed')::int, 0)          AS workload_completed_count,

    (
      COALESCE((s.node_01_school->>'status') = 'COMPLETED', false) AND
      COALESCE((s.node_02_roster->>'status') = 'COMPLETED', false) AND
      COALESCE((s.node_06_classes->>'status') = 'COMPLETED', false) AND
      COALESCE((s.node_11_validation->>'status') = 'COMPLETED', false) AND
      COALESCE((s.personnel_summary->>'all_personnel_ready')::boolean, false)
    ) AS is_all_nodes_completed,

    s.updated_at
FROM esf7_school_node_status s
LEFT JOIN schools_iern i ON (
    CAST(s.school_id AS TEXT) = CAST(i.school_id AS TEXT) 
    OR s.school_id = ('SCH-' || CAST(i.school_id AS TEXT))
    OR REPLACE(s.school_id, 'SCH-', '') = CAST(i.school_id AS TEXT)
);

-- 25. Real-Time Personnel Node Progress Boolean View
CREATE OR REPLACE VIEW vw_esf7_personnel_node_progress AS
SELECT
    p.school_id,
    p.school_year,
    p.personnel_id,
    p.personnel_name,
    p.position_title,
    p.category,
    p.is_school_head,
    
    COALESCE((p.node_03_room_qr->>'status') = 'COMPLETED', false)     AS is_room_qr_completed,
    COALESCE((p.node_04_profile->>'status') = 'COMPLETED', false)     AS is_profile_completed,
    COALESCE((p.node_07_designation->>'status') = 'COMPLETED', false) AS is_designation_completed,
    COALESCE((p.node_08_workload->>'status') = 'COMPLETED', false)    AS is_workload_completed,
    COALESCE((p.node_09_allowances->>'status') = 'COMPLETED', false)  AS is_allowances_completed,

    p.is_complete AS is_teacher_fully_completed,
    p.updated_at
FROM esf7_personnel_node_status p;
