const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

async function run() {
  const esf7ConnectionString = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=require`;
  const pool = new Pool({ connectionString: esf7ConnectionString, ssl: { rejectUnauthorized: false } });

  try {
    const res = await pool.query("SELECT id, prn, school_id, first_name, middle_name, last_name, deped_email FROM personnel WHERE school_id = '123456'");
    console.log("Local personnel rows for 123456:", res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
