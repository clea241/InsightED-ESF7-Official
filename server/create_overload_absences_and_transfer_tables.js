const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createAbsencesAndTransferTables() {
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
    console.log("Creating table 'overload_absences'...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS overload_absences (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          leave_type TEXT NOT NULL DEFAULT 'SICK_LEAVE',
          total_days INTEGER DEFAULT 1,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_overload_absences_personnel ON overload_absences (personnel_id);
      CREATE INDEX IF NOT EXISTS idx_overload_absences_dates ON overload_absences (start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_overload_absences_school_sy ON overload_absences (school_id, school_year);
    `);
    console.log("Table 'overload_absences' created successfully!");

    console.log("Creating table 'esf7_workload_transfer'...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_workload_transfer (
          id VARCHAR(50) PRIMARY KEY,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          
          absent_personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          relieving_personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          
          absence_id VARCHAR(50) REFERENCES overload_absences(id) ON DELETE CASCADE,
          workload_id VARCHAR(50) NOT NULL,
          workload_type TEXT NOT NULL DEFAULT 'ELEM_JHS',
          subject TEXT NOT NULL,
          
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          relieving_hours NUMERIC(4,2) DEFAULT 1.00,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_workload_transfer_relieving ON esf7_workload_transfer (relieving_personnel_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_workload_transfer_absent ON esf7_workload_transfer (absent_personnel_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_workload_transfer_absence ON esf7_workload_transfer (absence_id);
    `);
    console.log("Table 'esf7_workload_transfer' created successfully!");

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

createAbsencesAndTransferTables().catch(err => {
  console.error('Error creating tables:', err);
  process.exit(1);
});
