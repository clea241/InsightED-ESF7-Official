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
    const un = await client.query(`
      SELECT a.id, a.personnel_id, a.school_id, a.has_uniform, a.has_supplies, a.has_medical, a.has_hardship
      FROM esf7_personnel_allowances a
      WHERE NOT EXISTS (
        SELECT 1 FROM esf7_personnel_profile p
        WHERE a.personnel_id = p.id 
           OR (a.school_id = p.school_id AND (a.personnel_id = p.legacy_id OR a.personnel_id = p.employee_no))
      )
      LIMIT 10;
    `);
    console.log("Sample unmatched allowance records:", un.rows);

    // Check one of them in school_drafts
    if (un.rows.length > 0) {
      const sample = un.rows[0];
      const draft = await client.query(
        "SELECT payload FROM school_drafts WHERE school_id = $1",
        [sample.school_id],
      );
      if (draft.rows.length > 0) {
        const personnel =
          draft.rows[0].payload?.personnel ||
          draft.rows[0].payload?.teachers ||
          [];
        const found = personnel.find((p) => p.id === sample.personnel_id);
        console.log(
          `Searching for ${sample.personnel_id} in school ${sample.school_id} draft:`,
          found ? "FOUND" : "NOT FOUND",
        );
        if (found)
          console.log("Found draft teacher:", {
            id: found.id,
            name: found.name || `${found.first_name} ${found.last_name}`,
            empNo: found.employeeNo || found.employee_no,
          });
      }
      // And in esf7_personnel_profile for that school
      const profs = await client.query(
        "SELECT id, legacy_id, employee_no, first_name, last_name FROM esf7_personnel_profile WHERE school_id = $1 LIMIT 5",
        [sample.school_id],
      );
      console.log(`Profiles in school ${sample.school_id}:`, profs.rows);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
