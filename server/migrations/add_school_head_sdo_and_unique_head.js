// Additive migration for Rows 14/16.
//  1. esf7_school_head_sdo: SDO-supplied school head (fallback when the roster has none).
//  2. One designated school head per school, enforced by the database (partial unique index).
// The index is only created when no school currently has 2+ designated heads; otherwise it lists them and skips,
// so nothing is changed or deleted. Review the output, fix the duplicates in the Roster, then re-run.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../db');

(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS esf7_school_head_sdo (
      id TEXT PRIMARY KEY, school_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL,
      position_title TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const dup = await db.query(`
    SELECT REPLACE(school_id,'SCH-','') AS school, COUNT(*) AS heads
      FROM esf7_personnel_profile WHERE is_school_head = TRUE
     GROUP BY 1 HAVING COUNT(*) > 1`);
  if (dup.rows.length) {
    console.log('Skipped unique index: these schools have more than one designated head:', dup.rows);
  } else {
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_personnel_one_school_head
      ON esf7_personnel_profile ((REPLACE(school_id,'SCH-',''))) WHERE is_school_head = TRUE`);
    console.log('Unique school-head index ready.');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
