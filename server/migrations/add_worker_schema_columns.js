require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
// ADDITIVE ONLY: adds the columns server/queue_worker.js writes but that no schema file, startup block or migration
// in the repo creates:
//   esf7_personnel_employment.raw_payload                      JSONB DEFAULT '{}'
//   esf7_school_profile.has_elem_inclusive / has_jhs_inclusive / has_shs_inclusive          BOOLEAN NOT NULL DEFAULT FALSE
//   esf7_school_profile.elem_inclusive_programs / jhs_inclusive_programs / shs_inclusive_programs   JSONB DEFAULT '[]'
// (types match what the worker inserts and what utils/payloadExtras.js declares). Nothing is altered, dropped or
// rewritten. Not run automatically.
//
// FIRST run the read-only check docs/ops/worker-schema-check.sql against the target database: if a column already
// exists, this migration leaves it untouched (ADD COLUMN IF NOT EXISTS) and does not record it as its own.
// BEFORE RUNNING: take a database backup of the two tables.
//
// Up:   node server/migrations/add_worker_schema_columns.js
// Down: node server/migrations/add_worker_schema_columns.js --down
//       Drops ONLY the columns this script itself created (recorded in schema_migration_log), never a column that
//       already existed. Review what it will drop with:  node ... --down --dry-run
const MIGRATION = "add_worker_schema_columns";
const COLUMNS = [
  ["esf7_personnel_employment", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  [
    "esf7_school_profile",
    "has_elem_inclusive",
    "BOOLEAN NOT NULL DEFAULT FALSE",
  ],
  [
    "esf7_school_profile",
    "elem_inclusive_programs",
    "JSONB DEFAULT '[]'::jsonb",
  ],
  [
    "esf7_school_profile",
    "has_jhs_inclusive",
    "BOOLEAN NOT NULL DEFAULT FALSE",
  ],
  [
    "esf7_school_profile",
    "jhs_inclusive_programs",
    "JSONB DEFAULT '[]'::jsonb",
  ],
  [
    "esf7_school_profile",
    "has_shs_inclusive",
    "BOOLEAN NOT NULL DEFAULT FALSE",
  ],
  [
    "esf7_school_profile",
    "shs_inclusive_programs",
    "JSONB DEFAULT '[]'::jsonb",
  ],
  ["esf7_school_profile", "extras", "JSONB DEFAULT '{}'::jsonb"],
  ["esf7_als_sections", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  ["esf7_aral_sections", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  ["esf7_personnel_designations", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  ["esf7_personnel_learning_areas", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  ["esf7_perssonel_educ", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  [
    "esf7_remedial_enrichment_sections",
    "raw_payload",
    "JSONB DEFAULT '{}'::jsonb",
  ],
  ["esf7_shs_workload_rows", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  ["esf7_sned_sections", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  ["esf7_workload_transfer", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  ["overload_pay_and_reason", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
];

async function columnExists(client, table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return r.rows.length > 0;
}

async function up(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migration_log (
       migration TEXT NOT NULL,
       table_name TEXT NOT NULL,
       column_name TEXT NOT NULL,
       added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (migration, table_name, column_name)
     )`,
  );
  for (const [table, column, definition] of COLUMNS) {
    if (await columnExists(client, table, column)) {
      console.log(`[Migration] ${table}.${column} already exists, left as is.`);
      continue;
    }
    await client.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`,
    );
    await client.query(
      `INSERT INTO schema_migration_log (migration, table_name, column_name)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [MIGRATION, table, column],
    );
    console.log(`[Migration] added ${table}.${column}`);
  }
}

async function down(client, dryRun) {
  const hasLog = await client.query(
    "SELECT to_regclass('schema_migration_log') AS t",
  );
  if (!hasLog.rows[0].t) {
    console.log("[Migration] nothing to undo (no schema_migration_log).");
    return;
  }
  const rows = (
    await client.query(
      "SELECT table_name, column_name FROM schema_migration_log WHERE migration = $1",
      [MIGRATION],
    )
  ).rows;
  // Only drop what this script created AND that is one of its own columns (the log is not trusted blindly).
  const own = new Set(COLUMNS.map(([t, c]) => `${t}.${c}`));
  for (const { table_name, column_name } of rows) {
    if (!own.has(`${table_name}.${column_name}`)) continue;
    if (dryRun) {
      console.log(`[Migration] would drop ${table_name}.${column_name}`);
      continue;
    }
    await client.query(
      `ALTER TABLE ${table_name} DROP COLUMN IF EXISTS ${column_name}`,
    );
    await client.query(
      "DELETE FROM schema_migration_log WHERE migration = $1 AND table_name = $2 AND column_name = $3",
      [MIGRATION, table_name, column_name],
    );
    console.log(`[Migration] dropped ${table_name}.${column_name}`);
  }
}

async function run() {
  const isDown = process.argv.includes("--down");
  const dryRun = process.argv.includes("--dry-run");
  const { pool } = require("../db/index.js"); // loaded only when run, so the column list can be imported without a database
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (isDown) await down(client, dryRun);
    else await up(client);
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[Migration] failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) run();

module.exports = { COLUMNS, MIGRATION };
