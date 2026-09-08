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
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'esf7_link'
    ORDER BY ordinal_position;
  `);
  console.log('esf7_link columns in insightEd:');
  cols.rows.forEach(c => console.log(' -', c.column_name, `(${c.data_type})`));

  const sample = await pool.query('SELECT * FROM esf7_link ORDER BY updated_at DESC LIMIT 3');
  console.log('\nSample esf7_link rows:');
  console.table(sample.rows.map(r => ({
    school_id: r.school_id,
    semester: r.semester,
    status: r.status,
    file_path: r.file_path ? r.file_path.substring(0, 30) : null,
    uploaded_at: r.uploaded_at,
    updated_at: r.updated_at
  })));

  await pool.end();
}

run();
