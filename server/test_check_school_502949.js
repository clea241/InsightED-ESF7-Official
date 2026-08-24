const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const insightEdPool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function check502949() {
  try {
    const res1 = await insightEdPool.query('SELECT COUNT(*) FROM esf7_database WHERE school_id = $1', ['502949']);
    console.log('Count for school_id = 502949:', res1.rows[0].count);

    const res2 = await insightEdPool.query('SELECT COUNT(*) FROM esf7_database WHERE school_id = $1', [502949]);
    console.log('Count for school_id = 502949 (number):', res2.rows[0].count);

    const sample = await insightEdPool.query('SELECT DISTINCT school_id, school_name FROM esf7_database WHERE school_name LIKE $1 LIMIT 5', ['%Puro%']);
    console.log('Puro Schools in esf7_database:', sample.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await insightEdPool.end();
    process.exit(0);
  }
}

check502949();
