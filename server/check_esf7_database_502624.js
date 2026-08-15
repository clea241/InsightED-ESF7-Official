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
    console.log(`🔍 Checking esf7_database for School ID ${schoolId}...`);

    const esfRes = await pool.query(
      `SELECT DISTINCT school_id, school_name, division, region FROM esf7_database WHERE school_id = $1 LIMIT 5`,
      [schoolId]
    );
    console.log('🏫 School Match in esf7_database:', esfRes.rows);

    const countRes = await pool.query(
      `SELECT count(*) FROM esf7_database WHERE school_id = $1`,
      [schoolId]
    );
    console.log('👥 Personnel Count in esf7_database:', countRes.rows[0]);

    const sampleRow = await pool.query(
      `SELECT * FROM esf7_database WHERE school_id = $1 LIMIT 2`,
      [schoolId]
    );
    console.log('📄 Sample Row Columns:', sampleRow.rows[0] ? Object.keys(sampleRow.rows[0]) : 'None');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error checking esf7_database:', err);
    process.exit(1);
  }
}

main();
