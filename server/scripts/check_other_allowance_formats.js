require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Pool } = require("../node_modules/pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT personnel_id, school_id 
      FROM esf7_personnel_allowances 
      WHERE personnel_id NOT LIKE 'PER-%' AND personnel_id !~ '^[0-9]+$' 
      LIMIT 10;
    `);
    console.log("Other ID formats sample:", res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
