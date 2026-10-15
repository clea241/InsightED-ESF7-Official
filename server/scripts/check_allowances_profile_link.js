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
    console.log("--- Inspecting esf7_personnel_allowances rows ---");
    const stats = await client.query(`
      SELECT 
        count(*) as total_allowances,
        count(DISTINCT school_id) as distinct_schools,
        count(DISTINCT personnel_id) as distinct_personnel,
        count(DISTINCT school_year) as distinct_sy
      FROM esf7_personnel_allowances;
    `);
    console.log("Stats:", stats.rows[0]);

    // Check personnel_id match with esf7_personnel_profile
    const matchProfile = await client.query(`
      SELECT 
        (SELECT count(*) FROM esf7_personnel_allowances a JOIN esf7_personnel_profile p ON a.personnel_id = p.id) as match_by_id,
        (SELECT count(*) FROM esf7_personnel_allowances a JOIN esf7_personnel_profile p ON a.personnel_id = p.employee_no) as match_by_emp_no
    `);
    console.log("Match with profile:", matchProfile.rows[0]);

    // Check how many personnel in esf7_personnel_profile exist
    const profCount = await client.query(
      "SELECT count(*) FROM esf7_personnel_profile",
    );
    console.log(
      "Total personnel in esf7_personnel_profile:",
      profCount.rows[0].count,
    );

    // Sample rows from esf7_personnel_allowances
    const sample = await client.query(`
      SELECT a.id, a.personnel_id, a.school_id, a.school_year, 
        a.has_pera, a.has_uniform, a.has_supplies, a.has_medical, a.has_hardship
      FROM esf7_personnel_allowances a
      LIMIT 5;
    `);
    console.log("Sample allowances:");
    console.log(sample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
