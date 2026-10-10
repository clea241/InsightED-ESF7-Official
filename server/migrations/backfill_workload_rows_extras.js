// STEP 2 of the esf7_workload_rows payload change: copy what the legacy raw_payload holds beyond the typed columns into
// `extras`, and fill typed columns that are empty while the payload has a value. raw_payload itself is never modified here.
//
//   node migrations/backfill_workload_rows_extras.js              dry run: reads everything, writes nothing, prints what it would do
//   node migrations/backfill_workload_rows_extras.js --apply      writes in batches (safe to re-run; only rows that still differ are touched)
//   options: --batch 5000   --limit N (stop after N legacy rows, for tests)   --allow-non-local (needed for any host other than localhost)
//
// Safety: optimistic check per row (the row is only updated if raw_payload is still what was read), updated_at is not touched.
// Back up esf7_workload_rows first. Rows written by the new code have raw_payload = '{}' and are skipped.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../db");
const { splitLegacyPayload, deepEqual } = require("../utils/workloadPayload");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? argv[i + 1] : d;
};
const APPLY = argv.includes("--apply");
const BATCH = Number(opt("batch", 5000));
const LIMIT = opt("limit") ? Number(opt("limit")) : Infinity;
const FILL_COLS = [
  "grade_level",
  "section_id",
  "section_name",
  "subject",
  "subject_id",
  "remediation_subject",
];
const TIME_COLS = ["start_time", "end_time"];

(async () => {
  const who = await db.query(
    "SELECT current_database() AS db, inet_server_addr()::text AS host",
  );
  const { db: dbName, host } = who.rows[0];
  console.log(
    `Target database: ${dbName} (${host || "local socket"}) - ${APPLY ? "APPLY" : "dry run"}`,
  );
  const addr = String(host || "").replace(/\/\d+$/, "");
  const isLocal = addr === "" || addr === "::1" || addr.startsWith("127.");
  if (!isLocal && !argv.includes("--allow-non-local")) {
    console.error(
      "Refusing: target is not local. Re-run with --allow-non-local only after a backup and a successful local rehearsal.",
    );
    process.exit(2);
  }
  const col = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name='esf7_workload_rows' AND column_name='extras'",
  );
  if (!col.rows.length) {
    console.error(
      "esf7_workload_rows.extras is missing. Run migrations/expand_workload_rows_extras.js first.",
    );
    process.exit(2);
  }

  const stats = {
    legacyRows: 0,
    skippedNewFormat: 0,
    unchanged: 0,
    toUpdate: 0,
    updated: 0,
    raced: 0,
    fills: {},
    extrasKeys: {},
    extrasBytes: 0,
  };
  let lastId = "";
  while (stats.legacyRows < LIMIT) {
    const { rows } = await db.query(
      `SELECT id, raw_payload, extras, grade_level, section_id, section_name, subject, subject_id, remediation_subject,
              to_char(start_time, 'HH24:MI:SS') AS start_time, to_char(end_time, 'HH24:MI:SS') AS end_time, days, term
         FROM esf7_workload_rows WHERE id > $1 ORDER BY id LIMIT $2`,
      [lastId, BATCH],
    );
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;
    const upd = [];
    for (const r of rows) {
      const payload = r.raw_payload;
      if (
        !payload ||
        typeof payload !== "object" ||
        Object.keys(payload).length === 0
      ) {
        stats.skippedNewFormat++;
        continue;
      }
      stats.legacyRows++;
      const { fills, extras } = splitLegacyPayload(payload, r);
      const fillsChanged = Object.keys(fills).length > 0;
      if (!fillsChanged && deepEqual(extras, r.extras || {})) {
        stats.unchanged++;
        continue;
      }
      stats.toUpdate++;
      for (const c of Object.keys(fills))
        stats.fills[c] = (stats.fills[c] || 0) + 1;
      for (const k of Object.keys(extras))
        stats.extrasKeys[k] = (stats.extrasKeys[k] || 0) + 1;
      stats.extrasBytes += JSON.stringify(extras).length;
      upd.push({
        id: r.id,
        old: JSON.stringify(payload),
        extras: JSON.stringify(extras),
        fills,
      });
    }
    if (APPLY && upd.length) {
      const f = (c) =>
        upd.map((u) => (u.fills[c] === undefined ? null : u.fills[c]));
      const res = await db.query(
        `UPDATE esf7_workload_rows t SET
           extras = v.extras::jsonb,
           ${FILL_COLS.map((c) => `${c} = COALESCE(v.${c}, t.${c})`).join(", ")},
           ${TIME_COLS.map((c) => `${c} = COALESCE(v.${c}::time, t.${c})`).join(", ")}
         FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS old, unnest($3::text[]) AS extras,
                      ${[...FILL_COLS, ...TIME_COLS].map((c, i) => `unnest($${4 + i}::text[]) AS ${c}`).join(", ")}) v
         WHERE t.id = v.id AND t.raw_payload = v.old::jsonb`,
        [
          upd.map((u) => u.id),
          upd.map((u) => u.old),
          upd.map((u) => u.extras),
          ...[...FILL_COLS, ...TIME_COLS].map(f),
        ],
      );
      stats.updated += res.rowCount;
      stats.raced += upd.length - res.rowCount;
    }
    if ((stats.legacyRows + stats.skippedNewFormat) % (BATCH * 10) < BATCH)
      console.log(
        `  ... ${stats.legacyRows + stats.skippedNewFormat} rows read`,
      );
  }
  const top = Object.entries(stats.extrasKeys)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  console.log(
    JSON.stringify(
      {
        ...stats,
        extrasKeys: undefined,
        topExtrasKeys: top,
        avgExtrasBytes: stats.toUpdate
          ? Math.round(stats.extrasBytes / stats.toUpdate)
          : 0,
      },
      null,
      2,
    ),
  );
  if (!APPLY)
    console.log(
      "Dry run only: nothing was written. Re-run with --apply after reviewing the numbers.",
    );
  else if (stats.raced)
    console.log(
      `${stats.raced} rows changed while running; run the script again to pick them up.`,
    );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
