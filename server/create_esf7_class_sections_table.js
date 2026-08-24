const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createClassSectionsTable() {
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
    console.log("Creating table 'esf7_class_sections'...");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_class_sections (
          id VARCHAR(50) PRIMARY KEY,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          
          grade_level TEXT NOT NULL,
          section_name TEXT NOT NULL,
          section_type TEXT NOT NULL DEFAULT 'MONO GRADE',
          
          advisor_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
          
          advisory_minutes INTEGER DEFAULT 300,
          
          male_learners INTEGER DEFAULT 0,
          female_learners INTEGER DEFAULT 0,
          number_of_learners INTEGER DEFAULT 0,
          
          standard TEXT DEFAULT 'WITHIN STANDARD' CHECK (standard IN ('BELOW STANDARD', 'WITHIN STANDARD', 'ABOVE STANDARD', 'BELOW', 'WITHIN', 'ABOVE')),
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT uq_school_sy_grade_section UNIQUE (school_id, school_year, grade_level, section_name)
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_class_sections_school_sy ON esf7_class_sections (school_id, school_year);
      CREATE INDEX IF NOT EXISTS idx_esf7_class_sections_advisor ON esf7_class_sections (advisor_id);
    `);

    console.log("Table 'esf7_class_sections' created successfully!");

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

createClassSectionsTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
