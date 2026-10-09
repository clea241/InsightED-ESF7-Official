const db = require("../db");

async function main() {
  console.log("--- Checking natural key duplicates in esf7_workload_rows ---");
  const resWkl = await db.query(`
    SELECT school_id, personnel_id, term, days, start_time, end_time, section_name, subject, count(*) as count
    FROM esf7_workload_rows 
    GROUP BY school_id, personnel_id, term, days, start_time, end_time, section_name, subject 
    HAVING count(*) > 1 
    LIMIT 5
  `);
  console.log(`Workload duplicate groups found: ${resWkl.rows.length}`);
  if (resWkl.rows.length > 0) console.log(resWkl.rows);

  console.log(
    "\n--- Checking natural key duplicates in esf7_regular_sections ---",
  );
  const resSec = await db.query(`
    SELECT school_id, school_year, grade_level, section_name, count(*) as count
    FROM esf7_regular_sections 
    GROUP BY school_id, school_year, grade_level, section_name 
    HAVING count(*) > 1 
    LIMIT 5
  `);
  console.log(`Regular sections duplicate groups found: ${resSec.rows.length}`);
  if (resSec.rows.length > 0) console.log(resSec.rows);

  console.log(
    "\n--- Checking natural key duplicates in esf7_personnel_profile (by PRN) ---",
  );
  const resPrn = await db.query(`
    SELECT prn, count(*) as count 
    FROM esf7_personnel_profile 
    GROUP BY prn 
    HAVING count(*) > 1 
    LIMIT 5
  `);
  console.log(`Personnel PRN duplicate groups found: ${resPrn.rows.length}`);
  if (resPrn.rows.length > 0) console.log(resPrn.rows);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
