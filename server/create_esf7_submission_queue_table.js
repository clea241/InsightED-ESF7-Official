const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function createSubmissionQueueTable() {
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
    console.log("Creating table 'esf7_submission_queue' and view 'submission_queue'...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_submission_queue (
          id SERIAL PRIMARY KEY,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL DEFAULT '2026-2027',
          
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          signature TEXT,
          certified_by TEXT,
          
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'CANCELLED')),
          error_message TEXT,
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_submission_queue_status_id ON esf7_submission_queue (status, id ASC);
      CREATE INDEX IF NOT EXISTS idx_esf7_submission_queue_school_sy ON esf7_submission_queue (school_id, school_year);

      -- Ensure submission_queue exists as table or view
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'submission_queue') THEN
          CREATE VIEW submission_queue AS SELECT * FROM esf7_submission_queue;
        END IF;
      END $$;
    `);
    console.log("Table 'esf7_submission_queue' created successfully!");

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

createSubmissionQueueTable().catch(err => {
  console.error('Error creating table:', err);
  process.exit(1);
});
