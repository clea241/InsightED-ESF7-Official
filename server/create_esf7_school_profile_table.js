const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createSchoolProfileTable() {
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
    console.log("Creating table 'esf7_school_profile'...");
    await client.query(`
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
    `);
    console.log("Table 'esf7_school_profile' created successfully!");

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

createSchoolProfileTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
