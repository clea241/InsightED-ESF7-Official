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
    employee_no TEXT,
    deped_email TEXT,
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

-- 4. Personnel Education Table (Degree, Postgraduate, Discipline & Eligibility JSONB)
CREATE TABLE IF NOT EXISTS esf7_perssonel_educ (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL UNIQUE REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    
    college_degree TEXT NOT NULL,
    major TEXT,
    minor TEXT,
    post_graduate_degree TEXT DEFAULT 'N/A',
    post_graduate_discipline TEXT,
    
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

-- 16. Overload Late Table (Teacher Tardiness Logs for Overload Disqualification on Specific Date)
CREATE TABLE IF NOT EXISTS overload_late (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    
    tardiness_date DATE NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_personnel_sy_tardiness_date UNIQUE (personnel_id, school_year, tardiness_date)
);

CREATE INDEX IF NOT EXISTS idx_overload_late_personnel ON overload_late (personnel_id);
CREATE INDEX IF NOT EXISTS idx_overload_late_date ON overload_late (tardiness_date);
CREATE INDEX IF NOT EXISTS idx_overload_late_school_sy ON overload_late (school_id, school_year);

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

-- 20. School Profile Table (Stores Elementary, JHS, JHS JSONB Special Programs, and SHS Curriculum Model)
CREATE TABLE IF NOT EXISTS esf7_school_profile (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    
    has_elem_special_programs BOOLEAN NOT NULL DEFAULT FALSE,
    has_jhs_special_programs BOOLEAN NOT NULL DEFAULT FALSE,
    jhs_special_programs JSONB DEFAULT '[]'::jsonb,
    shs_curriculum_model TEXT,
    
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
