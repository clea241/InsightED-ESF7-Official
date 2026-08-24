const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createWorkloadTables() {
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
    console.log("Creating tables 'esf7_workload_rows' and 'esf7_shs_workload_rows'...");
    
    // 1. Elementary & Junior High School Workload Rows
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_workload_rows (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          
          grade_level TEXT,
          section_id VARCHAR(50) REFERENCES esf7_class_sections(id) ON DELETE SET NULL,
          section_name TEXT,
          
          subject TEXT NOT NULL,
          subject_id VARCHAR(50),
          remediation_subject TEXT,
          
          start_time TIME,
          end_time TIME,
          days JSONB DEFAULT '["M","T","W","TH","F"]'::jsonb,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_workload_rows_personnel ON esf7_workload_rows (personnel_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_workload_rows_school_sy ON esf7_workload_rows (school_id, school_year);
      CREATE INDEX IF NOT EXISTS idx_esf7_workload_rows_section ON esf7_workload_rows (section_id);
    `);

    // 2. Senior High School Workload Rows (1st, 2nd, 3rd Terms)
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_shs_workload_rows (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          
          term TEXT NOT NULL DEFAULT '1st',
          semester TEXT,
          
          grade_level TEXT NOT NULL,
          track_strand TEXT,
          shs_subject_category TEXT,
          section_id VARCHAR(50) REFERENCES esf7_class_sections(id) ON DELETE SET NULL,
          section_name TEXT,
          
          subject TEXT NOT NULL,
          subject_id VARCHAR(50),
          remediation_subject TEXT,
          
          start_time TIME,
          end_time TIME,
          days JSONB DEFAULT '["M","T","W","TH","F"]'::jsonb,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_shs_workload_rows_personnel ON esf7_shs_workload_rows (personnel_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_shs_workload_rows_term ON esf7_shs_workload_rows (personnel_id, term);
      CREATE INDEX IF NOT EXISTS idx_esf7_shs_workload_rows_school_sy ON esf7_shs_workload_rows (school_id, school_year);
    `);

    console.log("Tables 'esf7_workload_rows' and 'esf7_shs_workload_rows' created successfully!");

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

createWorkloadTables().catch(err => {
  console.error('Error creating tables:', err);
  process.exit(1);
});
