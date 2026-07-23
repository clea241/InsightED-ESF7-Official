const db = require('./db');

async function migrate() {
  try {
    console.log('Migrating database schema for school drafts...');

    // 1. Create school_drafts table
    await db.query(`
      CREATE TABLE IF NOT EXISTS school_drafts (
        school_id TEXT NOT NULL,
        school_year TEXT NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, school_year)
      );
    `);
    console.log('school_drafts table created successfully!');

    // 2. Add to schema.sql for template tracking
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
