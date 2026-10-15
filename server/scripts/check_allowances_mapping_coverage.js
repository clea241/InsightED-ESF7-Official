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
      "--- Testing mapping coverage for esf7_personnel_allowances ---",
    );

    // 1. How many match profile.id directly?
    const directId = await client.query(`
      SELECT count(*) FROM esf7_personnel_allowances a
      JOIN esf7_personnel_profile p ON a.personnel_id = p.id;
    `);
    console.log("Direct profile.id match:", directId.rows[0].count);

    // 2. How many match profile.legacy_id on same school_id?
    const legacyMatch = await client.query(`
      SELECT count(*) FROM esf7_personnel_allowances a
      JOIN esf7_personnel_profile p 
        ON a.personnel_id = p.legacy_id 
        AND a.school_id = p.school_id;
    `);
    console.log("Legacy_id + school_id match:", legacyMatch.rows[0].count);

    // 3. How many match profile.employee_no on same school_id?
    const empMatch = await client.query(`
      SELECT count(*) FROM esf7_personnel_allowances a
      JOIN esf7_personnel_profile p 
        ON a.personnel_id = p.employee_no 
        AND a.school_id = p.school_id;
    `);
    console.log("Employee_no + school_id match:", empMatch.rows[0].count);

    // 4. Combined matches
    const combined = await client.query(`
      SELECT count(*) FROM esf7_personnel_allowances a
      JOIN esf7_personnel_profile p 
        ON (a.personnel_id = p.id OR (a.school_id = p.school_id AND (a.personnel_id = p.legacy_id OR a.personnel_id = p.employee_no)));
    `);
    console.log(
      "Total allowances that match a profile in same school:",
      combined.rows[0].count,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
