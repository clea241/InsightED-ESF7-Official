const path = require("path");
const root = "e:\\InsightED - ESF7 Official";
const { Pool } = require(path.join(root, "node_modules", "pg"));

const PROD_URL =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require";
const USERS_URL =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/users_database?sslmode=require";

async function findSchools() {
  const prod = new Pool({ connectionString: PROD_URL });
  const users = new Pool({ connectionString: USERS_URL });

  try {
    // Check 300488 and 342285
    const explicitRes = await prod.query(`
      SELECT p.school_id, COUNT(DISTINCT p.id) as personnel_count,
             (SELECT COUNT(*) FROM esf7_regular_sections s WHERE s.school_id = p.school_id) as section_count,
             (SELECT COUNT(*) FROM esf7_workload_rows w WHERE w.school_id = p.school_id) as workload_count
      FROM esf7_personnel_profile p
      WHERE p.school_id IN ('300488', '342285', 'SCH-300488', 'SCH-342285')
      GROUP BY p.school_id
    `);
    console.log("Explicit schools:");
    console.table(explicitRes.rows);

    // Find other candidate schools with 30-100 personnel, active sections and workloads
    const candidatesRes = await prod.query(`
      SELECT p.school_id, 
             COUNT(DISTINCT p.id) as personnel_count,
             (SELECT COUNT(*) FROM esf7_regular_sections s WHERE s.school_id = p.school_id) as section_count,
             (SELECT COUNT(*) FROM esf7_workload_rows w WHERE w.school_id = p.school_id) as workload_count
      FROM esf7_personnel_profile p
      WHERE p.school_id NOT IN ('300488', '342285', 'SCH-300488', 'SCH-342285')
        AND p.school_id ~ '^[0-9]+$'
      GROUP BY p.school_id
      HAVING COUNT(DISTINCT p.id) BETWEEN 30 AND 120
         AND (SELECT COUNT(*) FROM esf7_regular_sections s WHERE s.school_id = p.school_id) > 10
         AND (SELECT COUNT(*) FROM esf7_workload_rows w WHERE w.school_id = p.school_id) > 20
      ORDER BY personnel_count ASC
      LIMIT 10
    `);
    console.log(
      "\nCandidates with 30-120 personnel & active sections/workloads:",
    );
    console.table(candidatesRes.rows);

    // Pick: 300488, 342285, and 3 from candidates
    const picked = ["300488", "342285"];
    for (const c of candidatesRes.rows) {
      if (picked.length < 5) picked.push(c.school_id);
    }

    console.log("\nFinal 5 Selected Schools:", picked);

    // Get user details & passcodes
    const sdoUsers = await users.query(
      `
      SELECT school_id, email, first_name, last_name, passcode
      FROM user_schoolhead 
      WHERE school_id = ANY($1)
    `,
      [picked],
    );
    console.log("\nUser credentials for selected schools:");
    console.table(sdoUsers.rows);
  } finally {
    await prod.end();
    await users.end();
  }
}

findSchools().catch(console.error);
