const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createLdTrainingsTable() {
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
    console.log("Creating table 'esf7_personnel_ld_trainings'...");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_ld_trainings (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          
          training_type TEXT NOT NULL CHECK (training_type IN ('NEAP', 'TESDA', 'OTHER', 'neap', 'tesda', 'other')),
          title TEXT NOT NULL,
          conductor TEXT,
          start_date DATE,
          end_date DATE,
          days INTEGER,
          total_hours NUMERIC,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_ld_trainings_personnel ON esf7_personnel_ld_trainings (personnel_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_ld_trainings_type ON esf7_personnel_ld_trainings (training_type);
    `);

    console.log("Table 'esf7_personnel_ld_trainings' created successfully!");

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

createLdTrainingsTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
