const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function run() {
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name ILIKE '%pending%school%'
  `);
  console.log('Matching tables:', tables.rows);

  for (const row of tables.rows) {
    const tName = row.table_name;
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = '${tName}'
    `);
    console.log(`\nTable ${tName} columns:`);
    cols.rows.forEach(c => console.log(' -', c.column_name, `(${c.data_type})`));

    const count = await pool.query(`SELECT count(*) FROM "${tName}"`);
    console.log(`Total rows in ${tName}:`, count.rows[0].count);

    const emptyPending = await pool.query(`
      SELECT p.school_id, p.registration_type, p.old_school_id 
      FROM pending_schools p
      LEFT JOIN esf7_database e ON CAST(COALESCE(e.schoool_id, e.school_id) AS TEXT) = p.school_id
      WHERE e.school_id IS NULL AND p.is_deleted = false
      LIMIT 10;
    `);
    console.log('\nPending schools with 0 records in esf7_database:');
    console.table(emptyPending.rows);
  }

  await pool.end();
}

run();
