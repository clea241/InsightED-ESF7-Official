const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "users_database",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function run() {
  try {
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_rosdo' 
      ORDER BY ordinal_position
    `);
    console.log("Columns in user_rosdo:", cols.rows);

    const count = await pool.query(`SELECT count(*) FROM user_rosdo`);
    console.log("Total count in user_rosdo:", count.rows[0].count);

    const sample = await pool.query(`
      SELECT uid, email, role, region, division, office, position, first_name, last_name, school_id, disabled, account_category 
      FROM user_rosdo 
      LIMIT 3
    `);
    console.log("Sample rows:", sample.rows);

    const sgodOfficers = await pool.query(`
      SELECT uid, email, role, region, division, office, position, first_name, last_name, school_id, disabled, account_category 
      FROM user_rosdo 
      WHERE office ILIKE '%SGOD%' OR office ILIKE '%School Governance%' OR position ILIKE '%Planning Officer%' 
      LIMIT 10
    `);
    console.log(
      "Existing SGOD / Planning Officers in user_rosdo:",
      sgodOfficers.rows,
    );
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

run();
