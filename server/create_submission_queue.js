const db = require('./db');

async function migrate() {
  try {
    console.log('Migrating database schema for submission queue...');

    // 1. Create submission_queue table
    await db.query(`
      CREATE TABLE IF NOT EXISTS submission_queue (
        id SERIAL PRIMARY KEY,
        school_id TEXT NOT NULL,
        school_year TEXT NOT NULL,
        payload JSONB NOT NULL,
        signature TEXT,
        certified_by TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_submission_queue_school_sy ON submission_queue (school_id, school_year);
      CREATE INDEX IF NOT EXISTS idx_submission_queue_status ON submission_queue (status);
    `);
    console.log('submission_queue table created successfully!');

    // 2. Add certification columns to schools table
    await db.query(`
      ALTER TABLE schools ADD COLUMN IF NOT EXISTS certified_by TEXT;
      ALTER TABLE schools ADD COLUMN IF NOT EXISTS certified_signature TEXT;
      ALTER TABLE schools ADD COLUMN IF NOT EXISTS certified_at TIMESTAMPTZ;
    `);
    console.log('Certification columns added to schools table!');

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
