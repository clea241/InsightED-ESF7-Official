const db = require('./db');

async function createExtraTasksTable() {
  try {
    console.log('🚀 Updating esf7_personnel_extra_tasks table (Dropping FK for draft compatibility)...');

    await db.query(`
      ALTER TABLE IF EXISTS esf7_personnel_extra_tasks 
      DROP CONSTRAINT IF EXISTS esf7_personnel_extra_tasks_personnel_id_fkey;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_extra_tasks (
        id VARCHAR(50) PRIMARY KEY,
        personnel_id VARCHAR(50) NOT NULL,
        school_id VARCHAR(50) NOT NULL,
        school_year VARCHAR(20) NOT NULL DEFAULT 'SY 26-27',
        task_category VARCHAR(50) NOT NULL,
        task_name VARCHAR(255) NOT NULL,
        calendar_dates JSONB DEFAULT '[]'::jsonb,
        start_time VARCHAR(10),
        end_time VARCHAR(10),
        raw_payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_extra_tasks_personnel 
      ON esf7_personnel_extra_tasks(personnel_id);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_extra_tasks_school_sy 
      ON esf7_personnel_extra_tasks(school_id, school_year);
    `);

    console.log('✅ esf7_personnel_extra_tasks table updated successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating esf7_personnel_extra_tasks table:', err.message);
    process.exit(1);
  }
}

createExtraTasksTable();
