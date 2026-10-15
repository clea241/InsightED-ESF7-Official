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
    console.log("--- Inspecting school_drafts teachers keys ---");
    // Check 10 schools
    const res = await client.query(`
      SELECT school_id, payload->'teachers' as teachers, payload->'personnel' as personnel
      FROM school_drafts
      WHERE payload->'teachers' IS NOT NULL OR payload->'personnel' IS NOT NULL
      LIMIT 10;
    `);

    const allTeacherKeys = new Set();
    for (const r of res.rows) {
      const list = r.teachers || r.personnel || [];
      for (const t of list) {
        if (t && typeof t === "object") {
          Object.keys(t).forEach((k) => allTeacherKeys.add(k));
        }
      }
    }
    console.log(
      "All teacher keys across sample drafts:",
      Array.from(allTeacherKeys),
    );

    // Specifically search for any key containing 'allow' or 'incent' or 'pera'
    const allowanceRelatedKeys = Array.from(allTeacherKeys).filter((k) =>
      /allow|incent|pera|uniform|suppl|hardship/i.test(k),
    );
    console.log("Allowance-related keys in teachers:", allowanceRelatedKeys);

    // Also check top-level keys in school_drafts payload
    const topKeys = await client.query(`
      SELECT DISTINCT jsonb_object_keys(payload) as k
      FROM school_drafts
      LIMIT 100;
    `);
    const topAllowanceKeys = topKeys.rows
      .map((r) => r.k)
      .filter((k) => /allow|incent|pera|uniform|suppl|hardship/i.test(k));
    console.log(
      "Top-level allowance-related keys in school_drafts:",
      topAllowanceKeys,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
