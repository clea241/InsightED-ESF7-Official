// STEP 5 of 5 (contract) for esf7_workload_rows: drop the legacy raw_payload column. SEPARATE and LATER than the expand/backfill steps.
// It refuses to run unless ALL of these hold:
//   - docs/orm-optimizer/workload-rows-payload-verification.json says PASS, for this database, no older than --max-age-hours (default 24),
//     and its row count equals the table's current row count;
//   - no row with a non-empty raw_payload was written after that verification started (old code still writing would make it stale);
//   - --backup <file> points to an existing, non-empty pg_dump of the table;
//   - --confirm is given; and the target is local unless --allow-non-local is given (only after a successful local rehearsal).
// A failed check leaves the column in place. Nothing else is touched.
//
//   node migrations/drop_workload_rows_raw_payload.js --backup <dump> [--confirm] [--rewrite] [--max-age-hours 24] [--allow-non-local]
//   --rewrite also runs VACUUM FULL afterwards (dropping a column does not shrink the table until it is rewritten; takes an exclusive lock).
//
// Roll back (column dropped by mistake): ADD COLUMN raw_payload JSONB DEFAULT '{}', restore the dump into a scratch table
// (pg_restore -t esf7_workload_rows into another database), then UPDATE esf7_workload_rows t SET raw_payload = s.raw_payload FROM scratch s WHERE s.id = t.id.
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../db");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? argv[i + 1] : d;
};
const fail = (msg) => {
  console.error(`REFUSED: ${msg}`);
  console.error("raw_payload was NOT dropped.");
  process.exit(2);
};

(async () => {
  const who = await db.query(
    "SELECT current_database() AS db, inet_server_addr()::text AS host",
  );
  const { db: dbName, host } = who.rows[0];
  console.log(`Target database: ${dbName} (${host || "local socket"})`);
  const addr = String(host || "").replace(/\/\d+$/, "");
  const isLocal = addr === "" || addr === "::1" || addr.startsWith("127.");
  if (!isLocal && !argv.includes("--allow-non-local"))
    fail(
      "target is not local; rehearse on the local database first, then pass --allow-non-local.",
    );

  const has = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name='esf7_workload_rows' AND column_name='raw_payload'",
  );
  if (!has.rows.length) {
    console.log("raw_payload is already gone; nothing to do.");
    process.exit(0);
  }
  const reportPath = path.join(
    __dirname,
    "..",
    "..",
    "docs",
    "orm-optimizer",
    "workload-rows-payload-verification.json",
  );
  if (!fs.existsSync(reportPath))
    fail(
      `no verification report at ${reportPath}. Run migrations/verify_workload_rows_extras.js first.`,
    );
  const rep = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const ageH = (Date.now() - new Date(rep.finishedAt).getTime()) / 3600000;
  const maxAge = Number(opt("max-age-hours", 24));
  if (rep.status !== "PASS") fail(`verification status is ${rep.status}.`);
  if (rep.database !== dbName)
    fail(`verification was run on "${rep.database}", not "${dbName}".`);
  if (ageH > maxAge)
    fail(
      `verification is ${ageH.toFixed(1)} h old (max ${maxAge} h). Run it again.`,
    );
  const count = Number(
    (await db.query("SELECT count(*) n FROM esf7_workload_rows")).rows[0].n,
  );
  if (count !== rep.rowCountAtEnd)
    fail(
      `row count is ${count} but the verified count was ${rep.rowCountAtEnd}. Run the verification again.`,
    );
  const stale = Number(
    (
      await db.query(
        "SELECT count(*) n FROM esf7_workload_rows WHERE raw_payload <> '{}'::jsonb AND updated_at > $1::timestamptz",
        [rep.startedAt],
      )
    ).rows[0].n,
  );
  if (stale > 0)
    fail(
      `${stale} rows with a legacy payload were written after the verification started (old code still writing?). Backfill and verify again.`,
    );
  const backup = opt("backup");
  if (!backup || !fs.existsSync(backup) || fs.statSync(backup).size === 0)
    fail("--backup <existing pg_dump file of esf7_workload_rows> is required.");

  console.log(
    `Verification PASS (${rep.rowsChecked} legacy rows, ${rep.keys.total} keys, 0 unaccounted), ${ageH.toFixed(1)} h old. Backup: ${backup} (${fs.statSync(backup).size} bytes).`,
  );
  if (!argv.includes("--confirm")) {
    console.log(
      "Dry run: all gates passed. Re-run with --confirm to drop esf7_workload_rows.raw_payload.",
    );
    process.exit(0);
  }
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "LOCK TABLE esf7_workload_rows IN SHARE ROW EXCLUSIVE MODE",
    );
    const again = Number(
      (await client.query("SELECT count(*) n FROM esf7_workload_rows")).rows[0]
        .n,
    );
    if (again !== rep.rowCountAtEnd)
      throw new Error(`row count changed to ${again} while locking; aborting`);
    await client.query(
      "ALTER TABLE esf7_workload_rows DROP COLUMN raw_payload",
    );
    await client.query("COMMIT");
    console.log("Dropped esf7_workload_rows.raw_payload.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`Aborted, column kept: ${e.message}`);
    process.exit(1);
  } finally {
    client.release();
  }
  if (argv.includes("--rewrite")) {
    console.log(
      "VACUUM FULL esf7_workload_rows (rewrites the table to reclaim the dropped column and the backfill's dead rows)...",
    );
    await db.query("VACUUM (FULL, ANALYZE) esf7_workload_rows");
    const sz = await db.query(
      "SELECT pg_size_pretty(pg_total_relation_size('esf7_workload_rows')) AS total, pg_size_pretty(pg_relation_size('esf7_workload_rows')) AS heap",
    );
    console.log(
      `Table size now: heap ${sz.rows[0].heap}, total ${sz.rows[0].total}`,
    );
  } else
    console.log(
      "Disk space is not reclaimed until the table is rewritten (VACUUM FULL or pg_repack); re-run with --rewrite in a maintenance window.",
    );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
