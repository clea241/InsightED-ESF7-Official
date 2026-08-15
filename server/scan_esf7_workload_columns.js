const pg = require('pg');
const { Pool } = pg;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function main() {
  try {
    const schoolId = '502624';
    console.log(`🔍 Scanning esf7_database columns for School ID ${schoolId}...`);

    // Fetch 3 sample personnel rows from 502624
    const res = await pool.query(
      `SELECT * FROM esf7_database WHERE school_id = $1 OR schoool_id = $1 LIMIT 3`,
      [schoolId]
    );

    if (res.rows.length === 0) {
      console.log('No rows found for 502624, fetching from general esf7_database...');
      const fallback = await pool.query(`SELECT * FROM esf7_database LIMIT 3`);
      res.rows = fallback.rows;
    }

    const allColumns = Object.keys(res.rows[0] || {});
    console.log(`\n📋 Total Columns in esf7_database: ${allColumns.length}`);

    // Filter workload-related columns (lvl, subject, section, d1-d7, from, to)
    const workloadCols = allColumns.filter(c => 
      c.startsWith('lvl') || 
      c.startsWith('subject') || 
      c.startsWith('section') || 
      c.startsWith('d1') || c.startsWith('d2') || c.startsWith('d3') || c.startsWith('d4') || c.startsWith('d5') || c.startsWith('d6') || c.startsWith('d7') ||
      c.startsWith('from') || c.startsWith('to')
    );

    console.log(`\n🔍 Workload-related Column Names Sample (${workloadCols.length} columns found):`);
    console.log(workloadCols.slice(0, 40));

    console.log(`\n📄 Inspecting Workload Slot Data for Teacher 1 (${res.rows[0].first} ${res.rows[0].last}):`);
    for (let i = 1; i <= 5; i++) {
      const suffix = i === 1 ? '_1' : `_1_${i}`; // e.g. lvl_1, lvl_1_2, lvl_1_3
      // let's check column name variations
      const lvlKey = allColumns.find(c => c === `lvl${suffix}` || c === `lvl_${i}` || c === `lvl_1_${i}`);
      const subjKey = allColumns.find(c => c === `subject${suffix}` || c === `subject_${i}` || c === `subject_1_${i}`);
      const secKey = allColumns.find(c => c === `section${suffix}` || c === `section_${i}` || c === `section_1_${i}`);
      const fromKey = allColumns.find(c => c === `from${suffix}` || c === `from_${i}` || c === `from_1_${i}`);
      const toKey = allColumns.find(c => c === `to${suffix}` || c === `to_${i}` || c === `to_1_${i}`);
      const d1Key = allColumns.find(c => c === `d1${suffix}` || c === `d1_${i}` || c === `d1_1_${i}`);

      console.log(`  Slot ${i}:`, {
        lvlKey: lvlKey ? res.rows[0][lvlKey] : undefined,
        subjKey: subjKey ? res.rows[0][subjKey] : undefined,
        secKey: secKey ? res.rows[0][secKey] : undefined,
        fromKey: fromKey ? res.rows[0][fromKey] : undefined,
        toKey: toKey ? res.rows[0][toKey] : undefined,
        d1Key: d1Key ? res.rows[0][d1Key] : undefined,
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error scanning esf7_database:', err);
    process.exit(1);
  }
}

main();
