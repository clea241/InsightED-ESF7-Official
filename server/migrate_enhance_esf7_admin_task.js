const { Client } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const sslConfig =
  process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false;

async function migrateEnhanceAdminTask() {
  const targetDbName = "insighted_esf7";
  console.log(`[Migration] Connecting to '${targetDbName}'...`);

  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: targetDbName,
    ssl: sslConfig,
  });

  await client.connect();

  try {
    console.log(
      "[Migration] Enhancing 'esf7_admin_task' table for Gantt chart & timetable integration...",
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_admin_task (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
          school_id VARCHAR(50) NOT NULL,
          school_year VARCHAR(20) NOT NULL DEFAULT '2026-2027',
          
          task_name TEXT NOT NULL,
          task_category VARCHAR(50) DEFAULT 'General Administration',
          
          start_date DATE,
          end_date DATE,
          start_time TIME,
          end_time TIME,
          days JSONB DEFAULT '["M", "T", "W", "TH", "F"]'::jsonb,
          dates JSONB DEFAULT '[]'::jsonb,
          term VARCHAR(10) DEFAULT '1st',
          
          duration_minutes INTEGER NOT NULL DEFAULT 60,
          term_total_hours NUMERIC(6, 2) DEFAULT 0.00,
          
          is_designation_synced BOOLEAN DEFAULT FALSE,
          status VARCHAR(20) DEFAULT 'ACTIVE',
          
          raw_payload JSONB DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Add columns if table already existed with fewer columns
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS task_category VARCHAR(50) DEFAULT 'General Administration';
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS start_date DATE;
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS end_date DATE;
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS start_time TIME;
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS end_time TIME;
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS days JSONB DEFAULT '["M", "T", "W", "TH", "F"]'::jsonb;
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS term VARCHAR(10) DEFAULT '1st';
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS term_total_hours NUMERIC(6, 2) DEFAULT 0.00;
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS is_designation_synced BOOLEAN DEFAULT FALSE;
      ALTER TABLE esf7_admin_task ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';

      CREATE INDEX IF NOT EXISTS idx_esf7_admin_task_personnel ON esf7_admin_task (personnel_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_admin_task_school ON esf7_admin_task (school_id, school_year);
      CREATE INDEX IF NOT EXISTS idx_esf7_admin_task_dates ON esf7_admin_task (start_date, end_date);
    `);

    console.log("[Migration] 'esf7_admin_task' schema enhanced successfully!");

    const checkRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'esf7_admin_task'
      ORDER BY ordinal_position;
    `);

    console.log("\n--- Verified esf7_admin_task Columns in insighted_esf7 ---");
    checkRes.rows.forEach((r) =>
      console.log(`• ${r.column_name} (${r.data_type})`),
    );
    console.log(
      "-----------------------------------------------------------\n",
    );
  } finally {
    await client.end();
  }
}

migrateEnhanceAdminTask().catch((err) => {
  console.error("[Migration Error]:", err);
  process.exit(1);
});
