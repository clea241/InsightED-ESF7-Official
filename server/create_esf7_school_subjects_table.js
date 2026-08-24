const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createSchoolSubjectsTable() {
  const targetDbName = 'insighted_esf7';
  console.log(`Connecting to '${targetDbName}'...`);

  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: targetDbName,
    ssl: sslConfig
  });

  await client.connect();

  try {
    console.log("Creating table 'esf7_school_subjects'...");
    
    await client.query(`
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
    `);

    console.log("Table 'esf7_school_subjects' created successfully!");

    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('\n--- Verified Tables in insighted_esf7 ---');
    res.rows.forEach((row, idx) => console.log(`${idx + 1}. ${row.table_name}`));
    console.log('-----------------------------------------\n');

  } finally {
    await client.end();
  }
}

createSchoolSubjectsTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
