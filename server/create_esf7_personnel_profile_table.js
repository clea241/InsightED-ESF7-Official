const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createPersonnelProfileTable() {
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
    console.log("Creating table 'esf7_personnel_profile'...");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_profile (
          id VARCHAR(50) PRIMARY KEY,
          prn TEXT UNIQUE NOT NULL,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'teaching' CHECK (type IN ('teaching', 'teaching-related', 'non-teaching')),
          
          -- IDENTITY TAB COLUMNS
          salutation TEXT NOT NULL DEFAULT 'MR.',
          first_name TEXT NOT NULL,
          middle_name TEXT,
          last_name TEXT NOT NULL,
          name_extension TEXT,
          tin TEXT,
          no_tin BOOLEAN NOT NULL DEFAULT FALSE,
          
          -- PERSONAL TAB COLUMNS
          sex_at_birth TEXT CHECK (sex_at_birth IN ('Male', 'Female', 'MALE', 'FEMALE')),
          civil_status TEXT,
          solo_parent BOOLEAN NOT NULL DEFAULT FALSE,
          religion TEXT,
          ethnic_group TEXT,
          birthdate DATE,
          age INTEGER,
          philsys_no TEXT,
          employee_no TEXT,
          deped_email TEXT,
          is_school_head BOOLEAN NOT NULL DEFAULT FALSE,
          
          -- FLEXIBLE DATA STORAGE (JSONB)
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          -- TIMESTAMPS
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_profile_school_sy ON esf7_personnel_profile (school_id, school_year);
      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_profile_prn ON esf7_personnel_profile (prn);
    `);

    console.log("Table 'esf7_personnel_profile' created successfully!");

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

createPersonnelProfileTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
