const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createOverloadPayAndReasonTable() {
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
    console.log("Creating table 'overload_pay_and_reason'...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS overload_pay_and_reason (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          
          term TEXT NOT NULL DEFAULT 'Term 1',
          month TEXT,
          
          overload_hours NUMERIC(6,2) DEFAULT 0.00,
          overload_pay NUMERIC(10,2) DEFAULT 0.00,
          net_term_pay NUMERIC(10,2) DEFAULT 0.00,
          
          reasons JSONB DEFAULT '[]'::jsonb,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT uq_personnel_sy_term_month_overload UNIQUE (personnel_id, school_year, term, month)
      );

      CREATE INDEX IF NOT EXISTS idx_overload_pay_reason_personnel ON overload_pay_and_reason (personnel_id);
      CREATE INDEX IF NOT EXISTS idx_overload_pay_reason_school_sy ON overload_pay_and_reason (school_id, school_year);
      CREATE INDEX IF NOT EXISTS idx_overload_pay_reason_term_month ON overload_pay_and_reason (personnel_id, school_year, term, month);
    `);
    console.log("Table 'overload_pay_and_reason' created successfully!");

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

createOverloadPayAndReasonTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
