-- PostgreSQL Schema for InsightED eSF7 (Alphanumeric String IDs PK Architecture)

-- DROP TABLE IF EXISTS workload_transfers CASCADE;
-- DROP TABLE IF EXISTS workload_row_dates CASCADE;
-- DROP TABLE IF EXISTS workload_rows CASCADE;
-- DROP TABLE IF EXISTS class_sections CASCADE;
-- DROP TABLE IF EXISTS personnel_trainings CASCADE;
-- DROP TABLE IF EXISTS personnel_qualifications CASCADE;
-- DROP TABLE IF EXISTS personnel_employment CASCADE;
-- DROP TABLE IF EXISTS personnel CASCADE;
-- DROP TABLE IF EXISTS schools CASCADE;

-- 1. Schools Table
CREATE TABLE IF NOT EXISTS schools (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    iern TEXT,
    school_name TEXT NOT NULL,
    region TEXT NOT NULL,
    division TEXT NOT NULL,
    district TEXT,
    municipality TEXT,
    school_year TEXT NOT NULL,
    number_of_shifts INTEGER NOT NULL DEFAULT 1,
    curricular_offering TEXT[] NOT NULL DEFAULT '{}',
    contact_email TEXT,
    certified_by TEXT,
    certified_signature TEXT,
    certified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_school_year UNIQUE (school_id, school_year)
);

-- 2. Personnel Table
CREATE TABLE IF NOT EXISTS personnel (
    id VARCHAR(50) PRIMARY KEY,
    prn TEXT NOT NULL UNIQUE,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('teaching', 'teaching-related', 'non-teaching')),
    salutation TEXT NOT NULL,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    name_extension TEXT,
    sex_at_birth TEXT CHECK (sex_at_birth IN ('Male', 'Female', 'MALE', 'FEMALE')),
    civil_status TEXT,
    solo_parent BOOLEAN NOT NULL DEFAULT FALSE,
    religion TEXT,
    ethnic_group TEXT,
    birthdate DATE,
    philsys_no TEXT UNIQUE,
    tin TEXT UNIQUE,
    no_tin BOOLEAN NOT NULL DEFAULT FALSE,
    employee_no TEXT UNIQUE,
    deped_email TEXT NOT NULL DEFAULT '' CHECK (deped_email = '' OR deped_email LIKE '%@deped.gov.ph'),
    deployment_status TEXT,
    personal_verified BOOLEAN NOT NULL DEFAULT FALSE,
    workload_verified BOOLEAN NOT NULL DEFAULT FALSE,
    profiling_code TEXT NOT NULL,
    age INTEGER,
    is_school_head BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Personnel Employment Table
CREATE TABLE IF NOT EXISTS personnel_employment (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL UNIQUE REFERENCES personnel (id) ON DELETE CASCADE,
    position TEXT NOT NULL,
    designation TEXT,
    fund_source TEXT NOT NULL,
    nature_of_appointment TEXT NOT NULL,
    hiring_arrangement TEXT NOT NULL,
    assigned_schools TEXT[] DEFAULT '{}',
    grade_levels_taught TEXT[] NOT NULL DEFAULT '{}',
    first_service_date DATE NOT NULL,
    last_promotion_date DATE NOT NULL,
    new_station_date DATE NOT NULL,
    last_lateral_movement_date DATE,
    step_number INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Personnel Qualifications Table
CREATE TABLE IF NOT EXISTS personnel_qualifications (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL UNIQUE REFERENCES personnel (id) ON DELETE CASCADE,
    college_degree TEXT NOT NULL,
    major TEXT NOT NULL,
    minor TEXT,
    post_graduate_degree TEXT NOT NULL,
    discipline TEXT,
    eligibility TEXT NOT NULL,
    prc_specialization TEXT,
    prc_license_no TEXT,
    prc_expiry_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Personnel Trainings Table
CREATE TABLE IF NOT EXISTS personnel_trainings (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES personnel (id) ON DELETE CASCADE,
    training_type TEXT NOT NULL CHECK (training_type IN ('neap', 'certification', 'other')),
    title TEXT NOT NULL,
    conductor TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days INTEGER NOT NULL,
    hours_per_day NUMERIC NOT NULL,
    total_hours NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Class Sections Table
CREATE TABLE IF NOT EXISTS class_sections (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    section_name TEXT NOT NULL,
    adviser_id VARCHAR(50) REFERENCES personnel (id) ON DELETE SET NULL,
    section_type TEXT NOT NULL DEFAULT 'MONO GRADE' CHECK (section_type IN ('MULTIGRADE', 'MONO GRADE', 'NON GRADED', 'Regular', 'regular')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_section UNIQUE (school_id, school_year, grade_level, section_name)
);

-- 7. Workload Rows Table
CREATE TABLE IF NOT EXISTS workload_rows (
    id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) NOT NULL REFERENCES personnel (id) ON DELETE CASCADE,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    row_type TEXT NOT NULL CHECK (row_type IN ('teaching', 'teaching-related', 'administrative')),
    subject TEXT,
    task TEXT,
    grade_level TEXT,
    section_id VARCHAR(50) REFERENCES class_sections (id) ON DELETE CASCADE,
    start_time VARCHAR(20),
    end_time VARCHAR(20),
    days TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Workload Transfers Table
CREATE TABLE IF NOT EXISTS workload_transfers (
    id VARCHAR(50) PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    absent_personnel_id VARCHAR(50) NOT NULL REFERENCES personnel (id) ON DELETE CASCADE,
    substitute_personnel_id VARCHAR(50) NOT NULL REFERENCES personnel (id) ON DELETE CASCADE,
    workload_row_id VARCHAR(50) NOT NULL REFERENCES workload_rows (id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
    logged_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Workload Row Dates Table
CREATE TABLE IF NOT EXISTS workload_row_dates (
    id VARCHAR(50) PRIMARY KEY,
    workload_row_id VARCHAR(50) NOT NULL REFERENCES workload_rows (id) ON DELETE CASCADE,
    task_date DATE,
    start_time VARCHAR(20),
    end_time VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. School Drafts Table
CREATE TABLE IF NOT EXISTS school_drafts (
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (school_id, school_year)
);

-- 11. Performance Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_personnel_school_sy ON personnel (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_class_sections_school_sy ON class_sections (school_id, school_year);
CREATE INDEX IF NOT EXISTS idx_workload_rows_personnel ON workload_rows (personnel_id);
CREATE INDEX IF NOT EXISTS idx_workload_rows_school ON workload_rows (school_id);
CREATE INDEX IF NOT EXISTS idx_workload_row_dates_row ON workload_row_dates (workload_row_id);
CREATE INDEX IF NOT EXISTS idx_school_drafts_school_sy ON school_drafts (school_id, school_year);

-- 12. Request Center Tables (Clustered & Mergers)
CREATE TABLE IF NOT EXISTS clustered_connections (
    id SERIAL PRIMARY KEY,
    requester_school_id TEXT NOT NULL,
    target_school_id TEXT NOT NULL,
    personnel_id TEXT,
    personnel_name TEXT,
    request_type TEXT NOT NULL CHECK (request_type IN ('clustered_teacher', 'school_merger')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_merger_registry (
    id SERIAL PRIMARY KEY,
    parent_school_id TEXT NOT NULL,
    child_school_id TEXT NOT NULL,
    merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clustered_connections_target ON clustered_connections (target_school_id, status);
CREATE INDEX IF NOT EXISTS idx_clustered_connections_requester ON clustered_connections (requester_school_id);
CREATE INDEX IF NOT EXISTS idx_school_merger_registry_child ON school_merger_registry (child_school_id);

-- 13. School Calendar Terms Table
CREATE TABLE IF NOT EXISTS school_calendar_terms (
    id SERIAL PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year VARCHAR(50) NOT NULL,
    term_name VARCHAR(100) NOT NULL,
    block_type VARCHAR(50) NOT NULL CHECK (block_type IN ('instructional', 'end_of_term', 'vacation')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_teaching BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_calendar_terms_school_sy ON school_calendar_terms (school_id, school_year);

