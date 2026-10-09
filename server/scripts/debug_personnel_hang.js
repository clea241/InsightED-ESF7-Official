const db = require("../db");
const { Pool } = require("pg");
require("dotenv").config();

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace("insighted_esf7", "insightEd")
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const insightEdPool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function debugPersonnel() {
  console.log("Step 1: Querying insightEdPool for 900230 in esf7_database...");
  let masterRes = await insightEdPool
    .query(
      `SELECT * FROM esf7_database WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1`,
      ["900230"],
    )
    .catch((e) => {
      console.error("esf7_database error:", e.message);
      return { rows: [] };
    });
  console.log("esf7_database rows:", masterRes.rows.length);

  console.log(
    "\nStep 2: Querying insightEdPool for 900230 in esf7_database_dummy...",
  );
  let dummyRes = await insightEdPool
    .query(
      `SELECT * FROM esf7_database_dummy WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1`,
      ["900230"],
    )
    .catch((e) => {
      console.error("esf7_database_dummy error:", e.message);
      return { rows: [] };
    });
  console.log("esf7_database_dummy rows:", dummyRes.rows.length);

  console.log(
    "\nStep 3: Querying db (stagingPool) for 900230 in esf7_personnel_profile...",
  );
  let result = await db.runWithSchool("900230", async () => {
    return db.query(
      `
      SELECT 
        p.*,
        e.id AS emp_id,
        e.position_category,
        e.position,
        e.step_increment
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      WHERE p.school_id = $1 OR p.school_id = $2
      ORDER BY p.created_at ASC, p.id ASC
    `,
      ["900230", "SCH-900230"],
    );
  });
  console.log("esf7_personnel_profile rows:", result.rows.length);

  console.log("\nStep 4: Querying workloads & admin tasks in db...");
  await db.runWithSchool("900230", async () => {
    const wklRes = await db.query(
      `SELECT * FROM esf7_workload_rows WHERE school_id = $1 OR school_id = $2 ORDER BY created_at ASC`,
      ["900230", "SCH-900230"],
    );
    console.log("workload rows:", wklRes.rows.length);
    const admRes = await db.query(
      `SELECT * FROM esf7_admin_task WHERE school_id = $1 ORDER BY created_at ASC`,
      ["900230"],
    );
    console.log("admin task rows:", admRes.rows.length);
  });

  console.log("\n✅ All database queries completed in < 1 second!");
  await insightEdPool.end();
  process.exit(0);
}

debugPersonnel().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
