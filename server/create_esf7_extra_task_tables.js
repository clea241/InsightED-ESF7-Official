const db = require('./db');

async function createExtraTaskTables() {
  try {
    console.log("Creating tables 'esf7_related_task' and 'esf7_admin_task'...");

    await db.query(`
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
    `);

    console.log("✅ Tables 'esf7_related_task' and 'esf7_admin_task' created successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating task tables:", err);
    process.exit(1);
  }
}

createExtraTaskTables();
