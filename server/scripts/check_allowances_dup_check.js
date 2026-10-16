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
    // Check if updating to p.id would cause duplicates
    const dupCheck = await client.query(`
      WITH mapped AS (
        SELECT 
          a.id,
          COALESCE(p1.id, p2.id, a.personnel_id) as target_personnel_id,
          a.school_year
        FROM esf7_personnel_allowances a
        LEFT JOIN esf7_personnel_profile p1 
          ON a.personnel_id = p1.legacy_id AND a.school_id = p1.school_id
        LEFT JOIN esf7_personnel_profile p2 
          ON a.personnel_id = p2.employee_no AND a.school_id = p2.school_id
      )
      SELECT target_personnel_id, school_year, count(*) as c
      FROM mapped
      GROUP BY target_personnel_id, school_year
      HAVING count(*) > 1
      LIMIT 10;
    `);
    console.log("Duplicates after mapping to profile.id:", dupCheck.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
