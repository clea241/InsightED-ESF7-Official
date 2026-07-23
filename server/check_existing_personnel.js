const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

async function run() {
  const esf7ConnectionString = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=require`;
  const pool = new Pool({ connectionString: esf7ConnectionString.replace('insighted_esf7', 'insightEd'), ssl: { rejectUnauthorized: false } });

  try {
    console.log('Querying columns of esf7_database...');
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'esf7_database'
    `);
    console.log('Columns in esf7_database:');
    columns.rows.forEach(r => {
      console.log(`- ${r.column_name} (${r.data_type})`);
    });

    console.log('\nFetching sample row from esf7_database...');
    const sample = await pool.query('SELECT * FROM esf7_database LIMIT 1');
    console.log(sample.rows[0]);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
