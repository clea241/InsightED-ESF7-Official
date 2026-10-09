const { Client } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const sslConfig =
  process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false;

async function testKeyStagePersistence() {
  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: "insighted_esf7",
    ssl: sslConfig,
  });

  await client.connect();

  try {
    console.log(
      "[Test] Verifying esf7_personnel_designations table structure...",
    );
    const colRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'esf7_personnel_designations' 
      ORDER BY ordinal_position;
    `);

    const colNames = colRes.rows.map((r) => r.column_name);
    console.log("[Test] Columns:", colNames.join(", "));

    if (!colNames.includes("key_stage")) {
      throw new Error(
        "Column 'key_stage' missing from esf7_personnel_designations!",
      );
    }

    console.log("✓ PASS: key_stage column is present in database.");

    // Fetch existing test designations
    const desRes = await client.query(`
      SELECT id, personnel_id, designation_name, key_stage, grade_level, subject_area, track, serialized_key 
      FROM esf7_personnel_designations 
      LIMIT 10
    `);

    console.log(
      `[Test] Current stored designations count: ${desRes.rows.length}`,
    );
    desRes.rows.forEach((r) => {
      console.log(
        `• [${r.id}] Person: ${r.personnel_id} | Name: ${r.designation_name} | KS: ${r.key_stage || "N/A"} | Grade: ${r.grade_level || "N/A"} | Subj: ${r.subject_area || "N/A"} | Track: ${r.track || "N/A"}`,
      );
    });
  } finally {
    await client.end();
  }
}

testKeyStagePersistence().catch((err) => {
  console.error("Test Failed:", err);
  process.exit(1);
});
