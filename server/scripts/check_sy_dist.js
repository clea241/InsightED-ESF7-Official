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
    const syRes = await client.query(`
      SELECT school_year, count(*) 
      FROM esf7_personnel_allowances 
      GROUP BY school_year;
    `);
    console.log(
      "Distinct school_year in esf7_personnel_allowances:",
      syRes.rows,
    );

    const syProfile = await client.query(`
      SELECT school_year, count(*) 
      FROM esf7_personnel_profile 
      GROUP BY school_year;
    `);
    console.log(
      "Distinct school_year in esf7_personnel_profile:",
      syProfile.rows,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
