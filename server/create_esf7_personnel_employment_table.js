const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createEmploymentTable() {
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
    console.log("Creating table 'esf7_personnel_employment'...");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_employment (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL UNIQUE REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          
          position_category TEXT NOT NULL CHECK (position_category IN ('TEACHING', 'RELATED TEACHING', 'NON-TEACHING', 'teaching', 'teaching-related', 'non-teaching')),
          position TEXT NOT NULL,
          step_increment INTEGER DEFAULT 1 CHECK (step_increment BETWEEN 1 AND 8),
          fund_source TEXT NOT NULL,
          nature_of_appointment TEXT NOT NULL,
          hiring_arrangement TEXT NOT NULL,
          deployment_status TEXT DEFAULT 'OWN STATION',
          
          assigned_schools JSONB DEFAULT '[]'::jsonb,
          grade_levels_taught JSONB DEFAULT '[]'::jsonb,
          
          first_service_date DATE,
          last_promotion_date DATE,
          new_station_date DATE,
          last_lateral_movement_date DATE,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_employment_personnel ON esf7_personnel_employment (personnel_id);
    `);

    console.log("Table 'esf7_personnel_employment' created successfully!");

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

createEmploymentTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
