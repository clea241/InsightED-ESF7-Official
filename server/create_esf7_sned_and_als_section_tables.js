const db = require("./db");

async function createSnedAndAlsSectionTables() {
  console.log(
    "🚀 Creating esf7_sned_sections and esf7_als_sections tables in insighted_esf7 database...",
  );
  try {
    // 1. Create esf7_sned_sections
    await db.query(`
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
    `);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_sned_sections_school_sy ON esf7_sned_sections (school_id, school_year);`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_sned_sections_adviser ON esf7_sned_sections (adviser_id);`,
    );
    console.log("✓ Created esf7_sned_sections table");

    // 2. Create esf7_als_sections
    await db.query(`
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
    `);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_als_sections_school_sy ON esf7_als_sections (school_id, school_year);`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_als_sections_adviser ON esf7_als_sections (adviser_id);`,
    );
    console.log("✓ Created esf7_als_sections table");

    console.log("🎉 Both SNED and ALS section tables created successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating SNED/ALS section tables:", err.message);
    process.exit(1);
  }
}

createSnedAndAlsSectionTables();
