const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'insightEd',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT COALESCE(schoool_id, school_id) as sch_id, count(*), 
             MIN(school_name) as sample_name, MIN(division) as sample_div, MIN(region) as sample_reg 
      FROM esf7_database_dummy 
      GROUP BY COALESCE(schoool_id, school_id)
    `);
    console.log('Schools in insightEd.esf7_database_dummy:', res.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
