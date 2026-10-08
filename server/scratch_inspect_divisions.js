const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'users_database',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT DISTINCT region, division 
      FROM user_rosdo 
      WHERE division IS NOT NULL AND division != '' 
      ORDER BY region, division
    `);
    console.log(`Found ${res.rows.length} divisions in user_rosdo:`);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
