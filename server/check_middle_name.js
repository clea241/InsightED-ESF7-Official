const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

async function run() {
  const esf7ConnectionString = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=require`;
  const pool = new Pool({ connectionString: esf7ConnectionString.replace('insighted_esf7', 'insightEd'), ssl: { rejectUnauthorized: false } });

  try {
    const res = await pool.query("SELECT last_first, first, middle, last FROM esf7_database WHERE school_id = '123456'");
    console.log("Teachers in esf7_database for school '123456':");
    res.rows.forEach(r => {
      console.log(`- last_first: "${r.last_first}" | first: "${r.first}" | middle: "${r.middle}" | last: "${r.last}"`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
