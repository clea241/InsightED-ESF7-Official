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
    console.log(
      "=== Inspecting raw_payload patterns in esf7_personnel_allowances ===",
    );
    const samples = await client.query(`
      SELECT id, personnel_id, raw_payload
      FROM esf7_personnel_allowances
      WHERE raw_payload IS NOT NULL
      LIMIT 5;
    `);
    console.log(samples.rows);

    const keys = await client.query(`
      SELECT DISTINCT jsonb_object_keys(raw_payload) as k
      FROM esf7_personnel_allowances
      LIMIT 20;
    `);
    console.log(
      "Keys in raw_payload:",
      keys.rows.map((r) => r.k),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
