const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createDesignationsTable() {
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
    console.log("Creating table 'esf7_personnel_designations'...");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_designations (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          
          designation_name TEXT NOT NULL,
          grade_level TEXT,
          subject_area TEXT,
          track TEXT,
          is_sds_approved BOOLEAN NOT NULL DEFAULT FALSE,
          sds_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
          serialized_key TEXT NOT NULL,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_designations_personnel ON esf7_personnel_designations (personnel_id);
    `);

    console.log("Table 'esf7_personnel_designations' created successfully!");

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

createDesignationsTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
