const db = require("../db");

async function main() {
  const sid = process.argv[2] || "102175";
  console.log(`Checking normalized records for school: ${sid}`);

  const prof = await db.query(
    "SELECT count(*) FROM esf7_school_profile WHERE school_id = $1",
    [sid],
  );
  const per = await db.query(
    "SELECT count(*) FROM esf7_personnel_profile WHERE school_id = $1",
    [sid],
  );
  const emp = await db.query(
    "SELECT count(*) FROM esf7_personnel_employment e JOIN esf7_personnel_profile p ON e.personnel_id = p.id WHERE p.school_id = $1",
    [sid],
  );
  const edu = await db.query(
    "SELECT count(*) FROM esf7_perssonel_educ e JOIN esf7_personnel_profile p ON e.personnel_id = p.id WHERE p.school_id = $1",
    [sid],
  );
  const sec = await db.query(
    "SELECT count(*) FROM esf7_regular_sections WHERE school_id = $1",
    [sid],
  );
  const wkl = await db.query(
    "SELECT count(*) FROM esf7_workload_rows WHERE school_id = $1",
    [sid],
  );
  const orphanedAdv = await db.query(
    `
    SELECT s.id, s.section_name, s.adviser_id 
    FROM esf7_regular_sections s 
    LEFT JOIN esf7_personnel_profile p ON s.adviser_id = p.id 
    WHERE s.school_id = $1 AND s.adviser_id IS NOT NULL AND p.id IS NULL
  `,
    [sid],
  );

  console.log({
    esf7_school_profile: Number(prof.rows[0].count),
    esf7_personnel_profile: Number(per.rows[0].count),
    esf7_personnel_employment: Number(emp.rows[0].count),
    esf7_perssonel_educ: Number(edu.rows[0].count),
    esf7_regular_sections: Number(sec.rows[0].count),
    esf7_workload_rows: Number(wkl.rows[0].count),
    orphaned_advisers: orphanedAdv.rows.length,
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
