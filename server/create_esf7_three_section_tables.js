const db = require('./db');

async function createThreeSectionTables() {
  console.log('🚀 Creating 3 tailored section tables in insighted_esf7 database...');
  try {
    // 1. Create esf7_regular_sections
    await db.query(`
      CREATE TABLE IF NOT EXISTS esf7_regular_sections (
        id VARCHAR(50) PRIMARY KEY,
        school_id TEXT NOT NULL,
        school_year TEXT NOT NULL DEFAULT '2026-2027',
        grade_level TEXT NOT NULL,
        section_name TEXT NOT NULL,
        adviser_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
        section_type TEXT NOT NULL DEFAULT 'MONO GRADE',
        male_learners INTEGER DEFAULT 0,
        female_learners INTEGER DEFAULT 0,
        number_of_learners INTEGER DEFAULT 0,
        raw_payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_regular_section_school_sy UNIQUE (school_id, school_year, grade_level, section_name)
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_regular_sections_school_sy ON esf7_regular_sections (school_id, school_year);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_regular_sections_adviser ON esf7_regular_sections (adviser_id);`);
    console.log('✓ Created esf7_regular_sections');

    // 2. Create esf7_aral_sections
    await db.query(`
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
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_aral_sections_school_sy ON esf7_aral_sections (school_id, school_year);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_aral_sections_tutor ON esf7_aral_sections (tutor_id);`);
    console.log('✓ Created esf7_aral_sections');

    // 3. Create esf7_remedial_enrichment_sections
    await db.query(`
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
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_remedial_sections_school_sy ON esf7_remedial_enrichment_sections (school_id, school_year);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_remedial_sections_teacher ON esf7_remedial_enrichment_sections (assigned_teacher_id);`);
    console.log('✓ Created esf7_remedial_enrichment_sections');

    // 4. Safely drop legacy esf7_class_sections table
    await db.query(`DROP TABLE IF EXISTS esf7_class_sections CASCADE;`);
    console.log('✓ Dropped legacy esf7_class_sections');

    console.log('🎉 All 3 section tables created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating 3 section tables:', err.message);
    process.exit(1);
  }
}

createThreeSectionTables();
