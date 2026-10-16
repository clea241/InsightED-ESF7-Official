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
    const sId = "150020";
    const draft = await client.query(
      "SELECT payload FROM school_drafts WHERE school_id = $1",
      [sId],
    );
    if (draft.rows.length > 0) {
      console.log("Draft keys:", Object.keys(draft.rows[0].payload));
      const personnel = draft.rows[0].payload.personnel || [];
      console.log(`Personnel count in draft: ${personnel.length}`);
      if (personnel.length > 0) {
        console.log("Sample personnel:", personnel.slice(0, 3));
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
