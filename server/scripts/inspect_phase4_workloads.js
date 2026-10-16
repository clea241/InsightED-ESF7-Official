require("../db/directPort");
const { Pool } = require("pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 15000,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== INSPECTING esf7_workload_rows ===");

    // Total rows
    const c = await client.query("SELECT count(*) FROM esf7_workload_rows;");
    console.log("Total rows:", c.rows[0].count);

    // Indexes
    const idxs = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'esf7_workload_rows';
    `);
    console.log("\nIndexes:", idxs.rows);

    // Constraints
    const cons = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'esf7_workload_rows'::regclass;
    `);
    console.log("\nConstraints:", cons.rows);

    // Sample IDs and columns
    const samples = await client.query(`
      SELECT id, personnel_id, school_id, school_year, grade_level, section_name, subject, start_time, end_time, days, term, extras
      FROM esf7_workload_rows
      LIMIT 5;
    `);
    console.log("\nSample rows:");
    console.table(samples.rows);

    // Inspect how existing rebuild script created IDs and handled workloads
    // Let's see id patterns
    const idPatterns = await client.query(`
      SELECT 
        CASE 
          WHEN id LIKE 'wkl_%' THEN 'wkl_prefix'
          WHEN id ~ '^[0-9]+$' THEN 'numeric'
          WHEN id ~ '^[0-9a-fA-F-]{36}$' THEN 'uuid'
          ELSE 'other'
        END as id_pattern,
        count(*) as freq
      FROM esf7_workload_rows
      GROUP BY 1
      ORDER BY freq DESC;
    `);
    console.log("\nID patterns in esf7_workload_rows:");
    console.table(idPatterns.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
