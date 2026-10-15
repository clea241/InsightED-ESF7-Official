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
    const qClean = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w 
      JOIN esf7_regular_sections r 
        ON w.school_id = r.school_id 
        AND (
          UPPER(TRIM(w.section_name)) = UPPER(TRIM(r.section_name))
          OR UPPER(TRIM(SPLIT_PART(w.section_name, '/', 1))) = UPPER(TRIM(r.section_name))
          OR UPPER(TRIM(REGEXP_REPLACE(w.section_name, '(?i)/.*', ''))) = UPPER(TRIM(r.section_name))
          OR UPPER(TRIM(REGEXP_REPLACE(w.section_name, '(?i)^grade\\s*\\d+\\s*-\\s*', ''))) = UPPER(TRIM(r.section_name))
        );
    `);
    console.log(
      "Cleaned name matches with regular_sections:",
      qClean.rows[0].count,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
