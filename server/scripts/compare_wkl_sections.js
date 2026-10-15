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
    for (const schoolId of ["100009", "100016", "100018"]) {
      console.log(`\n================== School ${schoolId} ==================`);
      const secRows = await client.query(
        `
        SELECT id, section_name, grade_level 
        FROM esf7_regular_sections 
        WHERE school_id = $1 
        ORDER BY section_name;
      `,
        [schoolId],
      );
      console.log("Regular sections in DB:");
      console.log(secRows.rows);

      const wklRows = await client.query(
        `
        SELECT id, section_id, section_name, grade_level, subject 
        FROM esf7_workload_rows 
        WHERE school_id = $1 
        ORDER BY section_name;
      `,
        [schoolId],
      );
      console.log("Sample workload rows in DB (first 10):");
      console.log(wklRows.rows.slice(0, 10));

      // Let's also check school_drafts for this school to see how the draft defines both!
      const draftRes = await client.query(
        `
        SELECT payload->'sections' as sections,
               payload->'teachers' as teachers
        FROM school_drafts
        WHERE school_id = $1;
      `,
        [schoolId],
      );
      if (draftRes.rows.length > 0) {
        const sections = draftRes.rows[0].sections || [];
        console.log(`Draft sections count: ${sections.length}`);
        console.log(
          "Sample draft sections (first 3):",
          sections.slice(0, 3).map((s) => ({
            id: s.id,
            name: s.sectionName || s.section_name,
            grade: s.gradeLevel || s.grade_level,
          })),
        );

        const teachers = draftRes.rows[0].teachers || [];
        for (const t of teachers) {
          const wkl = t.workload || t.workloadRows || [];
          if (wkl.length > 0) {
            console.log(
              `Teacher ${t.id || t.name} draft workload rows (first 3):`,
              wkl.slice(0, 3).map((w) => ({
                id: w.id,
                sectionId: w.sectionId || w.section_id,
                sectionName: w.sectionName || w.section_name,
                grade: w.gradeLevel || w.grade_level,
              })),
            );
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
