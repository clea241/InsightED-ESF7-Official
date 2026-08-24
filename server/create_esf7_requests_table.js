const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createRequestsTable() {
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
    console.log("Creating table 'esf7_requests'...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_requests (
          id VARCHAR(50) PRIMARY KEY,
          requester_school_id TEXT NOT NULL,
          target_school_id TEXT NOT NULL,
          school_year TEXT NOT NULL DEFAULT '2026-2027',
          
          request_type TEXT NOT NULL,
          personnel_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
          personnel_name TEXT,
          
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'CANCELLED')),
          remarks TEXT,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_requests_target ON esf7_requests (target_school_id, status);
      CREATE INDEX IF NOT EXISTS idx_esf7_requests_requester ON esf7_requests (requester_school_id, status);
      CREATE INDEX IF NOT EXISTS idx_esf7_requests_personnel ON esf7_requests (personnel_id);
    `);
    console.log("Table 'esf7_requests' created successfully!");

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

createRequestsTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
