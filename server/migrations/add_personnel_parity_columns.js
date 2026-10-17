require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
// Brings a database (staging, production, a developer copy) to the schema the personnel code expects, for:
//   - Date of 1st Day of Service  (esf7_personnel_employment.first_service_date and the other tenure dates)
//   - the L&D tab                 (esf7_personnel_ld_trainings: conductor, dates, days, hours ...)
//   - PhilSys                     (esf7_personnel_profile.philsys_no / no_philsys)
//   - the columns the roster save, school-head and step logic read and write
// The list lives in server/db/personnelParity.js (the server also compares against it at startup and logs gaps).
//
// ADDITIVE AND IDEMPOTENT. It only
//   1. ADD COLUMN IF NOT EXISTS for anything missing,
//   2. converts a tenure/training date column that is TEXT to DATE, but only when every value is empty, "N/A" or
//      a real date (otherwise it stops for that column and says why; nothing is guessed),
//   3. adds a unique key the upserts need, if it is missing and there are no duplicates (otherwise it reports them),
//   4. backfills values that are still EMPTY from the row's own raw_payload (first day of service, PhilSys).
//      It never overwrites a value that is already there.
// Nothing is dropped or deleted. Re-running it changes nothing.
//
// BEFORE RUNNING on staging/production: take a backup (at least the four tables above).
//   Preview (changes nothing, rolled back):  node server/migrations/add_personnel_parity_columns.js --dry-run
//   Apply:                                    node server/migrations/add_personnel_parity_columns.js
//   Then verify (read-only):                  node server/migrations/add_personnel_parity_columns.js --check
const {
  REQUIRED_COLUMNS,
  DATE_COLUMNS,
  REQUIRED_UNIQUE,
  findParityGaps,
} = require("../db/personnelParity");

const exists = async (client, table, column) =>
  (
    await client.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
      [table, column],
    )
  ).rows[0]?.data_type || null;

const tableExists = async (client, table) =>
  Boolean(
    (await client.query("SELECT to_regclass($1) AS t", [table])).rows[0].t,
  );

async function addMissingColumns(client, log) {
  for (const [table, column, definition] of REQUIRED_COLUMNS) {
    if (!(await tableExists(client, table))) {
      log(
        `SKIP  ${table}: table does not exist (run the app once or schema.sql first)`,
      );
      continue;
    }
    if (await exists(client, table, column)) continue;
    await client.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`,
    );
    log(`ADDED ${table}.${column} ${definition}`);
  }
}

async function fixDateTypes(client, log) {
  for (const [table, column] of DATE_COLUMNS) {
    const type = await exists(client, table, column);
    if (!type || type === "date") continue;
    if (!/char|text/.test(type)) {
      log(`SKIP  ${table}.${column}: unexpected type ${type}, left as is`);
      continue;
    }
    const bad = await client.query(
      `SELECT COUNT(*)::int AS n FROM ${table}
        WHERE ${column} IS NOT NULL
          AND BTRIM(${column}::text) <> ''
          AND UPPER(BTRIM(${column}::text)) NOT IN ('N/A', 'NA', '-')
          AND ${column}::text !~ '^\\d{4}-\\d{2}-\\d{2}'`,
    );
    if (bad.rows[0].n > 0) {
      log(
        `SKIP  ${table}.${column}: ${bad.rows[0].n} value(s) are not dates; fix them first, then re-run (nothing converted)`,
      );
      continue;
    }
    await client.query(
      `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE DATE
         USING (CASE WHEN ${column}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN SUBSTRING(${column}::text FROM 1 FOR 10)::date ELSE NULL END)`,
    );
    log(`TYPED ${table}.${column}: ${type} -> date ("N/A"/empty became NULL)`);
  }
}

async function addUniqueKeys(client, log) {
  for (const [table, cols] of REQUIRED_UNIQUE) {
    if (!(await tableExists(client, table))) continue;
    const present = await client.query(
      `SELECT 1
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indrelid
        WHERE c.relname = $1 AND i.indisunique
          AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
                 FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attnum = ANY(i.indkey)) = $2::text[]`,
      [table, [...cols].sort()],
    );
    if (present.rows.length > 0) continue;
    const dup = await client.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT 1 FROM ${table} GROUP BY ${cols.join(", ")} HAVING COUNT(*) > 1
       ) d`,
    );
    if (dup.rows[0].n > 0) {
      log(
        `SKIP  unique(${cols.join(", ")}) on ${table}: ${dup.rows[0].n} duplicate group(s) exist; clean them up first`,
      );
      continue;
    }
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_${cols.join("_")} ON ${table} (${cols.join(", ")})`,
    );
    log(`ADDED unique(${cols.join(", ")}) on ${table}`);
  }
}

// Fill ONLY values that are still empty, from the row's own raw_payload (an older shape). Never overwrites.
async function backfill(client, log) {
  if (
    (await exists(client, "esf7_personnel_employment", "raw_payload")) &&
    (await exists(
      client,
      "esf7_personnel_employment",
      "first_service_date",
    )) === "date"
  ) {
    const r = await client.query(
      `UPDATE esf7_personnel_employment
          SET first_service_date = SUBSTRING(COALESCE(raw_payload->>'firstServiceDate', raw_payload->>'first_service_date') FROM 1 FOR 10)::date,
              updated_at = NOW()
        WHERE first_service_date IS NULL
          AND COALESCE(raw_payload->>'firstServiceDate', raw_payload->>'first_service_date') ~ '^\\d{4}-\\d{2}-\\d{2}'`,
    );
    log(`BACKFILL first_service_date from raw_payload: ${r.rowCount} row(s)`);
  }
  if (
    (await exists(client, "esf7_personnel_profile", "raw_payload")) &&
    (await exists(client, "esf7_personnel_profile", "philsys_no"))
  ) {
    const r = await client.query(
      `UPDATE esf7_personnel_profile
          SET philsys_no = BTRIM(COALESCE(raw_payload->>'philsysNo', raw_payload->>'philsys_no', raw_payload->>'phylsys_num')),
              updated_at = NOW()
        WHERE (philsys_no IS NULL OR BTRIM(philsys_no) = '')
          AND COALESCE(no_philsys, FALSE) = FALSE
          AND BTRIM(COALESCE(raw_payload->>'philsysNo', raw_payload->>'philsys_no', raw_payload->>'phylsys_num', '')) NOT IN ('', 'N/A', 'NA', '-')`,
    );
    log(`BACKFILL philsys_no from raw_payload: ${r.rowCount} row(s)`);
  }
}

async function run() {
  const checkOnly = process.argv.includes("--check");
  const dryRun = process.argv.includes("--dry-run");
  const { pool } = require("../db/index.js");
  const client = await pool.connect();
  const log = (m) => console.log(`[Parity] ${m}`);
  try {
    if (checkOnly) {
      const gaps = await findParityGaps((sql, p) => client.query(sql, p));
      if (gaps.length === 0) log("OK - this database matches the code.");
      else {
        gaps.forEach((g) =>
          log(
            `${g.problem.toUpperCase()}: ${g.table}.${g.column}${g.found ? ` (is ${g.found})` : ""}`,
          ),
        );
        process.exitCode = 2;
      }
      return;
    }
    await client.query("BEGIN");
    await addMissingColumns(client, log);
    await fixDateTypes(client, log);
    await addUniqueKeys(client, log);
    await backfill(client, log);
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    log(dryRun ? "Dry run finished: nothing was changed." : "Done.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[Parity] failed, nothing was changed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) run();

module.exports = { addMissingColumns, fixDateTypes, addUniqueKeys, backfill };
