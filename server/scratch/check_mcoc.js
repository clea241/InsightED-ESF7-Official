const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace('insighted_esf7', 'users_database')
    : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/users_database`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function run() {
  try {
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_schoolhead'
      ORDER BY ordinal_position;
    `);
    console.log('\nuser_schoolhead columns:');
    cols.rows.forEach(c => console.log(` - ${c.column_name.padEnd(30)} (${c.data_type})`));

    const sample = await pool.query(`SELECT * FROM user_schoolhead LIMIT 1`);
    console.log('\nSample user_schoolhead row:', sample.rows[0]);
  } catch (err) {
    console.error('Error checking mcoc:', err);
  } finally {
    await pool.end();
  }
}

run();
