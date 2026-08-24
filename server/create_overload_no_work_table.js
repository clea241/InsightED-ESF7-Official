const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createOverloadNoWorkTable() {
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
    console.log("Creating table 'overload_no_work'...");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS overload_no_work (
          id VARCHAR(50) PRIMARY KEY,
          region TEXT NOT NULL,
          division TEXT NOT NULL,
          school_id TEXT NOT NULL DEFAULT 'ALL',
          school_year TEXT NOT NULL,
          
          no_work_date DATE NOT NULL,
          event_type TEXT NOT NULL,
          title TEXT NOT NULL,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT uq_region_div_school_date UNIQUE (region, division, school_id, school_year, no_work_date)
      );

      CREATE INDEX IF NOT EXISTS idx_overload_no_work_region_div ON overload_no_work (region, division);
      CREATE INDEX IF NOT EXISTS idx_overload_no_work_school ON overload_no_work (school_id, school_year);
      CREATE INDEX IF NOT EXISTS idx_overload_no_work_date ON overload_no_work (no_work_date);
    `);

    console.log("Table 'overload_no_work' created successfully!");

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

createOverloadNoWorkTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
