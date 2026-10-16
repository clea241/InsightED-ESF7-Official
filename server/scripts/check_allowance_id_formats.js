require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Pool } = require("../node_modules/pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: process.env.DB_PASSWORD,
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        count(*) as total,
        count(*) FILTER (WHERE personnel_id LIKE 'PER-%') as per_count,
        count(*) FILTER (WHERE personnel_id ~ '^[0-9]+$') as num_count,
        count(*) FILTER (WHERE personnel_id ~ '^[0-9a-f-]{36}$') as uuid_count
      FROM esf7_personnel_allowances;
    `);
    console.log("ID formats in esf7_personnel_allowances:", res.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
