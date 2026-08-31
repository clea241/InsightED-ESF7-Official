const db = require('./db');

async function ensureDraftsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS school_drafts (
        school_id TEXT NOT NULL,
        school_year TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (school_id, school_year)
      );
    `);
    console.log('✓ school_drafts table verified/created');
    process.exit(0);
  } catch (err) {
    console.error('Error creating school_drafts table:', err);
    process.exit(1);
  }
}

ensureDraftsTable();
