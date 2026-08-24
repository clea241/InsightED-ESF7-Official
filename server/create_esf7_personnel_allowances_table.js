const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createAllowancesTable() {
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
    console.log("Creating table 'esf7_personnel_allowances'...");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_allowances (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          
          has_pera BOOLEAN NOT NULL DEFAULT FALSE,
          pera_amount NUMERIC(10,2) DEFAULT 2000.00,
          
          has_uniform BOOLEAN NOT NULL DEFAULT FALSE,
          uniform_amount NUMERIC(10,2) DEFAULT 7000.00,
          
          has_supplies BOOLEAN NOT NULL DEFAULT FALSE,
          supplies_amount NUMERIC(10,2) DEFAULT 10000.00,
          
          has_medical BOOLEAN NOT NULL DEFAULT FALSE,
          medical_amount NUMERIC(10,2) DEFAULT 7000.00,
          
          has_hardship BOOLEAN NOT NULL DEFAULT FALSE,
          hardship_amount NUMERIC(10,2) DEFAULT 0.00,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT uq_personnel_sy_allowances UNIQUE (personnel_id, school_year)
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_allowances_personnel ON esf7_personnel_allowances (personnel_id);
    `);

    console.log("Table 'esf7_personnel_allowances' created successfully!");

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

createAllowancesTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
