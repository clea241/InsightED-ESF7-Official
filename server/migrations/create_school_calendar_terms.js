// Additive, idempotent migration: school_calendar_terms (per-school academic calendar blocks used by /api/reports/calendar-terms).
// Safe to re-run; creates nothing destructive. Run with the target database set in the environment (server/.env or DB_* vars).
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../db");

(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS school_calendar_terms (
      id SERIAL PRIMARY KEY,
      school_id TEXT NOT NULL,
      school_year TEXT NOT NULL,
      term_name TEXT NOT NULL,
      block_type TEXT,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_teaching BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_school_calendar_terms_school_sy ON school_calendar_terms (school_id, school_year)`,
  );
  console.log("school_calendar_terms ready.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
