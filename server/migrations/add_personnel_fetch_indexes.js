// Run manually, off-peak, after a backup is confirmed. Nothing here runs automatically.
//
// Diagnostics on 2026-10-08 showed the esf7 tables used by GET /api/personnel already have the indexes
// they need (school_id + school_year, personnel_id). The one real gap is in the insightEd database:
// fetchMasterPersonnelFromInsightEd() falls back to `WHERE schoool_id = $1` (sic) when a school has no
// rows under school_id, and that column has no index. On esf7_database (~1M rows, ~2 GB) the fallback is a
// full parallel sequential scan (~200 ms of CPU per call, measured).
//
// CONCURRENTLY avoids blocking writes, but it cannot run inside a transaction, so this uses a plain client.
const { insightEdPool } = require("../db/index.js");

const STATEMENTS = [
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_esf7_db_schoool_id ON esf7_database (schoool_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS esf7_database_dummy_schoool_id_idx ON esf7_database_dummy (schoool_id)",
];

async function run() {
  const client = await insightEdPool.connect();
  try {
    for (const sql of STATEMENTS) {
      console.log("[Migration]", sql);
      await client.query(sql);
    }
    await client.query("ANALYZE esf7_database (schoool_id)");
    await client.query("ANALYZE esf7_database_dummy (schoool_id)");
    console.log("[Migration] done");
  } catch (err) {
    console.error("[Migration] failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await insightEdPool.end();
  }
}

run();
