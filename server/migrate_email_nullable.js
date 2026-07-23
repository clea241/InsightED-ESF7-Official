const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

async function run() {
  const esf7ConnectionString = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=require`;
  const pool = new Pool({ connectionString: esf7ConnectionString, ssl: { rejectUnauthorized: false } });

  try {
    console.log("Altering 'personnel' table to make 'deped_email' nullable...");
    await pool.query("ALTER TABLE personnel ALTER COLUMN deped_email DROP NOT NULL");
    console.log("Success!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await pool.end();
  }
}

run();
