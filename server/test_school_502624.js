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
  const res = await pool.query('SELECT first, last, employee_no FROM esf7_database WHERE school_id = $1 OR schoool_id = $1', ['502624']);
  console.log('Employee Nos:', res.rows.map(r => r.employee_no));
  process.exit(0);
}

main();
