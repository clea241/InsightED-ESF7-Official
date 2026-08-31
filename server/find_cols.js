const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({ connectionString: poolString, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });

async function findCols() {
  const res = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'esf7_database'
    ORDER BY column_name
  `);
  console.log('All columns:');
  console.log(res.rows.map(r => r.column_name).filter(c => !c.startsWith('d1_') && !c.startsWith('d2_') && !c.startsWith('d3_') && !c.startsWith('d4_') && !c.startsWith('d5_') && !c.startsWith('d6_') && !c.startsWith('d7_') && !c.startsWith('categ_') && !c.startsWith('department_')));
  await pool.end();
}

findCols();
