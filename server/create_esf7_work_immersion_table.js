const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createWorkImmersionTable() {
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
    console.log("Creating table 'esf7_work_immersion'...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_work_immersion (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          
          visit_date DATE NOT NULL,
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          duration_minutes INTEGER DEFAULT 0,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT uq_personnel_sy_immersion_date UNIQUE (personnel_id, school_year, visit_date)
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_work_immersion_personnel ON esf7_work_immersion (personnel_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_work_immersion_date ON esf7_work_immersion (visit_date);
      CREATE INDEX IF NOT EXISTS idx_esf7_work_immersion_school_sy ON esf7_work_immersion (school_id, school_year);
    `);
    console.log("Table 'esf7_work_immersion' created successfully!");

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

createWorkImmersionTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
