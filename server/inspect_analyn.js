const { Pool } = require('pg');

const pool = new Pool({
  user: 'Administrator1',
  password: 'pRZTbQ2T1JD7',
  host: 'stride-posgre-prod-01.postgres.database.azure.com',
  database: 'insightEd',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

async function inspect() {
  try {
    const res = await pool.query("SELECT * FROM esf7_database LIMIT 1");
    const row = res.rows[0];
    console.log("Column names:", Object.keys(row));
    console.log("\nSample row values:");
    Object.keys(row).forEach(k => {
      if (row[k]) console.log(`  ${k}: ${row[k]}`);
    });
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

inspect();
