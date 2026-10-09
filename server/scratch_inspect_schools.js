const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "insighted_esf7",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function run() {
  try {
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_school_profile'
    `);
    console.log(
      "Columns in esf7_school_profile:",
      cols.rows.map((c) => c.column_name),
    );

    const sample = await pool.query(
      `SELECT * FROM esf7_school_profile LIMIT 5`,
    );
    console.log("Sample esf7_school_profile:", sample.rows);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

run();
