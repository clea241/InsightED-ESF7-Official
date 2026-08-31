const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({ connectionString: poolString, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });

async function listCols() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'esf7_database'
    ORDER BY ordinal_position
  `);
  console.log('Columns in esf7_database:', res.rows.map(r => r.column_name));
  await pool.end();
}

listCols();
