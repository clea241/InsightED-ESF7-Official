// Additive, idempotent migration: index for keyset pagination of GET /api/workloads (ORDER BY created_at, id).
// Safe to re-run. Built CONCURRENTLY so writes to esf7_workload_rows are not blocked.
// Run with the target database set in the environment (server/.env or DB_* vars); the target is printed first.
// Try on the local database (esf7_local) before any shared environment.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../db");

const INDEX = "idx_esf7_workload_rows_created_at_id";

(async () => {
  const who = await db.query(
    "SELECT current_database() AS db, inet_server_addr()::text AS host",
  );
  console.log(
    `Target database: ${who.rows[0].db} (${who.rows[0].host || "local socket"})`,
  );

  // A failed CONCURRENTLY build leaves an INVALID index that IF NOT EXISTS would skip; drop only that case.
  const bad = await db.query(
    `SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1 AND NOT i.indisvalid`,
    [INDEX],
  );
  if (bad.rows.length) {
    console.log("Dropping invalid leftover index from an interrupted build.");
    await db.query(`DROP INDEX CONCURRENTLY IF EXISTS ${INDEX}`);
  }
  await db.query(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX} ON esf7_workload_rows (created_at ASC, id ASC)`,
  );
  await db.query("ANALYZE esf7_workload_rows");
  console.log(`${INDEX} ready.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
