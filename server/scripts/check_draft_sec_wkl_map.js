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
    // Pick 5 schools that we know have regular sections
    const secSchools = await client.query(`
      SELECT school_id, count(*) as c 
      FROM esf7_regular_sections 
      GROUP BY school_id 
      LIMIT 5;
    `);

    for (const row of secSchools.rows) {
      const sId = row.school_id;
      console.log(`\n================ School ${sId} ================`);

      const dbSec = await client.query(
        "SELECT id, section_name, grade_level FROM esf7_regular_sections WHERE school_id = $1 LIMIT 5",
        [sId],
      );
      console.log("DB esf7_regular_sections (first 5):", dbSec.rows);

      const dbWkl = await client.query(
        "SELECT id, section_id, section_name, grade_level FROM esf7_workload_rows WHERE school_id = $1 LIMIT 5",
        [sId],
      );
      console.log("DB esf7_workload_rows (first 5):", dbWkl.rows);

      const draft = await client.query(
        "SELECT payload FROM school_drafts WHERE school_id = $1",
        [sId],
      );
      if (draft.rows.length > 0) {
        const p = draft.rows[0].payload || {};
        const sections = p.sections || p.classSections || [];
        console.log(`Draft sections count: ${sections.length}`);
        if (sections.length > 0) {
          console.log("Sample draft section:", {
            id: sections[0].id,
            name: sections[0].sectionName || sections[0].section_name,
          });
        }
        const teachers = p.teachers || [];
        for (const t of teachers) {
          const w = t.workload || t.workloadRows || [];
          if (w.length > 0) {
            console.log("Sample draft teacher workload:", {
              id: w[0].id,
              sectionId: w[0].sectionId || w[0].section_id,
              sectionName: w[0].sectionName || w[0].section_name,
            });
            break;
          }
        }
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
