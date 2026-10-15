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
      SELECT payload->'teachers' as teachers 
      FROM school_drafts 
      WHERE school_id = '124919';
    `);
    const teachers = res.rows[0]?.teachers || [];
    const tWithWkl = teachers.filter(
      (t) => (t.workload || t.workloadRows || []).length > 0,
    );
    console.log(
      `Found ${tWithWkl.length} teachers with workload in school 124919`,
    );
    if (tWithWkl.length > 0) {
      console.log("Sample workload items:");
      const wkl = tWithWkl[0].workload || tWithWkl[0].workloadRows;
      console.log(JSON.stringify(wkl.slice(0, 5), null, 2));
    }

    // Now let's check what esf7_workload_rows has for school 124919
    const dbWkl = await client.query(`
      SELECT id, personnel_id, section_id, section_name, grade_level, subject
      FROM esf7_workload_rows
      WHERE school_id = '124919'
      LIMIT 5;
    `);
    console.log("\nCurrent esf7_workload_rows for school 124919:");
    console.log(dbWkl.rows);

    // And what esf7_regular_sections has for school 124919
    const dbSec = await client.query(`
      SELECT id, section_name, grade_level
      FROM esf7_regular_sections
      WHERE school_id = '124919'
      LIMIT 5;
    `);
    console.log("\nCurrent esf7_regular_sections for school 124919:");
    console.log(dbSec.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
