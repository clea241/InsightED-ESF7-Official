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
    // 1. Find 5 schools that have workloads in esf7_workload_rows but ZERO regular sections in esf7_regular_sections
    const schoolsWithoutSec = await client.query(`
      SELECT w.school_id, count(w.id) as wkl_count
      FROM esf7_workload_rows w
      LEFT JOIN esf7_regular_sections r ON w.school_id = r.school_id
      WHERE r.school_id IS NULL
      GROUP BY w.school_id
      LIMIT 10;
    `);
    console.log(
      "Schools with workloads but NO regular sections in DB:",
      schoolsWithoutSec.rows,
    );

    for (const row of schoolsWithoutSec.rows.slice(0, 3)) {
      const sId = row.school_id;
      const draft = await client.query(
        `
        SELECT payload
        FROM school_drafts
        WHERE school_id = $1;
      `,
        [sId],
      );
      if (draft.rows.length > 0) {
        const p = draft.rows[0].payload || {};
        console.log(`\n=== School ${sId} in school_drafts ===`);
        console.log("Top-level keys in payload:", Object.keys(p));
        console.log("classSections:", p.classSections?.length);
        console.log("sections:", p.sections?.length);
        console.log("classes:", p.classes?.length);
        console.log("organizedClasses:", p.organizedClasses?.length);
        console.log("alsSections:", p.alsSections?.length);
        console.log("aralSections:", p.aralSections?.length);
        console.log("snedSections:", p.snedSections?.length);
        console.log("teachers count:", p.teachers?.length);
        if (p.sections && p.sections.length > 0) {
          console.log("First section in sections:", p.sections[0]);
        }
        if (p.classSections && p.classSections.length > 0) {
          console.log("First section in classSections:", p.classSections[0]);
        }
      } else {
        console.log(`School ${sId} NOT found in school_drafts!`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
