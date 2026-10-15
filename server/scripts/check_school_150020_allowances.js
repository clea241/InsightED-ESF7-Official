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
    const sId = "150020";
    console.log(`=== School ${sId} in esf7_personnel_allowances ===`);
    const alw = await client.query(
      "SELECT id, personnel_id, school_id, has_pera, has_uniform, has_supplies, has_medical, has_hardship FROM esf7_personnel_allowances WHERE school_id = $1 LIMIT 5",
      [sId],
    );
    console.log(alw.rows);

    console.log(`\n=== School ${sId} in esf7_personnel_profile ===`);
    const prof = await client.query(
      "SELECT id, school_id, employee_no, first_name, last_name FROM esf7_personnel_profile WHERE school_id = $1 LIMIT 5",
      [sId],
    );
    console.log(prof.rows);

    console.log(`\n=== School ${sId} in school_drafts ===`);
    const draft = await client.query(
      "SELECT payload->'teachers' as teachers FROM school_drafts WHERE school_id = $1",
      [sId],
    );
    const teachers = draft.rows[0]?.teachers || [];
    console.log("Sample teachers in draft (first 5):");
    console.log(
      teachers.slice(0, 5).map((t) => ({
        id: t.id,
        name: t.name || `${t.first} ${t.last}`,
        employee_no: t.employee_no || t.emp_no,
      })),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
