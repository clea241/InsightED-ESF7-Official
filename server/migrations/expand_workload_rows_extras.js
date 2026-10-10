// STEP 1 of 3 (expand) for esf7_workload_rows: add the slim `extras` JSONB column that replaces the whole-body copy in `raw_payload`.
// Additive and idempotent: nothing is dropped or rewritten (adding a column with a constant default is metadata-only in PostgreSQL 11+).
//
// Order of the whole change (see docs/living/DECISIONS.md, 2026-10-10 "payload expand then contract"):
//   1. node migrations/expand_workload_rows_extras.js          (this file)
//   2. node migrations/backfill_workload_rows_extras.js --apply (copies payload-only keys into extras / empty typed columns)
//   3. deploy the code that writes and reads typed columns + extras
//   4. backfill again (catches rows the old code wrote in between), then node migrations/verify_workload_rows_extras.js
//   5. only if the verification report says PASS: node migrations/drop_workload_rows_raw_payload.js --confirm  (separate, later)
// Take a pg_dump of esf7_workload_rows first. Run on the local esf7_local database before anything else.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../db");

(async () => {
  const who = await db.query(
    "SELECT current_database() AS db, inet_server_addr()::text AS host",
  );
  console.log(
    `Target database: ${who.rows[0].db} (${who.rows[0].host || "local socket"})`,
  );
  await db.query(
    "ALTER TABLE esf7_workload_rows ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb",
  );
  console.log("esf7_workload_rows.extras ready (raw_payload untouched).");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
