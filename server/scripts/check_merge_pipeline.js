require("../db/directPort"); // connect directly to Postgres, not through PgBouncer
// DEPLOY-TIME CHECK (read-only). Fails (exit code 2) if the Room QR Approve & Merge pipeline cannot work on this
// database: a table it writes is missing from the database, or the personnel schema is behind the code.
// Run it after deploying and before users do:   node server/scripts/check_merge_pipeline.js
// Add it to the deploy script so a mismatch stops the deploy instead of surfacing as "Accept Operation Failed".
const {
  findMergePipelineProblems,
} = require("../controllers/room_profiling/upsertRegistry");
const { findParityGaps } = require("../db/personnelParity");

async function main() {
  const { pool } = require("../db/index.js");
  try {
    const query = (sql, params) => pool.query(sql, params);
    const problems = await findMergePipelineProblems(query);
    const gaps = await findParityGaps(query);
    gaps.forEach((g) =>
      problems.push(
        `${g.problem}: ${g.table}.${g.column}${g.found ? ` (is ${g.found})` : ""}`,
      ),
    );
    if (problems.length === 0) {
      console.log("[Merge pipeline] OK - every table and column is in place.");
      return;
    }
    console.error("[Merge pipeline] NOT READY:");
    problems.forEach((p) => console.error(`  - ${p}`));
    console.error(
      "Fix: node server/migrations/add_personnel_parity_columns.js (and create any missing table from server/schema.sql).",
    );
    process.exitCode = 2;
  } catch (err) {
    console.error("[Merge pipeline] check could not run:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) main();
