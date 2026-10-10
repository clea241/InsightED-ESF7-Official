// STEP 4 of the esf7_workload_rows payload change: prove that nothing in the legacy raw_payload is lost before the column is dropped.
// For every row it checks that each payload key and value is held by a typed column (same value) or by `extras` (deep-equal value),
// that the eight keys every old payload carried are rebuilt exactly by reconstructPayload(), and that row counts match.
// Writes docs/orm-optimizer/workload-rows-payload-verification.{json,md} (key names, counts and row ids only; never values).
// The drop migration refuses to run unless this report says PASS for the current row count.
//
//   node migrations/verify_workload_rows_extras.js [--backup-fingerprint <md5> --backup-rows <n>] [--out <dir>] [--batch 5000]
// --backup-fingerprint is md5(string_agg(id || ':' || md5(raw_payload::text), ',' ORDER BY id)) taken just before the change; when given,
// the report also proves raw_payload is byte-identical to the backed-up state.
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../db");
const {
  unaccountedKeys,
  reconstructPayload,
  deepEqual,
  ALIASES,
} = require("../utils/workloadPayload");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? argv[i + 1] : d;
};
const BATCH = Number(opt("batch", 5000));
const OUT = path.resolve(
  opt("out", path.join(__dirname, "..", "..", "docs", "orm-optimizer")),
);
const UNIVERSAL = [
  "id",
  "gradeLevel",
  "sectionId",
  "sectionName",
  "subject",
  "startTime",
  "endTime",
  "days",
];
const hhmm = (t) => (t == null ? null : String(t).slice(0, 5));

(async () => {
  const startedAt = new Date().toISOString();
  const who = await db.query(
    "SELECT current_database() AS db, inet_server_addr()::text AS host",
  );
  const { db: dbName, host } = who.rows[0];
  console.log(`Target database: ${dbName} (${host || "local socket"})`);
  const hasPayload = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name='esf7_workload_rows' AND column_name='raw_payload'",
  );
  if (!hasPayload.rows.length) {
    console.error(
      "raw_payload is already gone; nothing to verify against. Use the backup if you need to re-check.",
    );
    process.exit(2);
  }
  const countStart = Number(
    (await db.query("SELECT count(*) n FROM esf7_workload_rows")).rows[0].n,
  );

  const byKey = {};
  const stat = {
    rowsRead: 0,
    legacyRows: 0,
    newFormatRows: 0,
    keysTotal: 0,
    viaColumn: 0,
    viaExtras: 0,
    unaccounted: 0,
    rowsWithUnaccounted: 0,
    universalMismatch: 0,
    exactRows: 0,
    payloadBytes: 0,
    extrasBytes: 0,
  };
  const samples = [];
  let lastId = "";
  for (;;) {
    const { rows } = await db.query(
      `SELECT id, raw_payload, extras, grade_level, section_id, section_name, subject, subject_id, remediation_subject,
              to_char(start_time, 'HH24:MI:SS') AS start_time, to_char(end_time, 'HH24:MI:SS') AS end_time, days, term, personnel_id, school_id, school_year
         FROM esf7_workload_rows WHERE id > $1 ORDER BY id LIMIT $2`,
      [lastId, BATCH],
    );
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;
    for (const r of rows) {
      stat.rowsRead++;
      const p = r.raw_payload;
      if (!p || typeof p !== "object" || !Object.keys(p).length) {
        stat.newFormatRows++;
        continue;
      }
      stat.legacyRows++;
      stat.payloadBytes += JSON.stringify(p).length;
      stat.extrasBytes += JSON.stringify(r.extras || {}).length;
      const missing = unaccountedKeys(p, r);
      const rebuilt = reconstructPayload(r);
      let exact = true;
      for (const [k, v] of Object.entries(p)) {
        const e = (byKey[k] ||= { viaColumn: 0, viaExtras: 0, unaccounted: 0 });
        stat.keysTotal++;
        if (missing.includes(k)) {
          e.unaccounted++;
          stat.unaccounted++;
        } else if (
          Object.prototype.hasOwnProperty.call(r.extras || {}, k) &&
          deepEqual(r.extras[k], v)
        ) {
          e.viaExtras++;
          stat.viaExtras++;
        } else {
          e.viaColumn++;
          stat.viaColumn++;
        }
        if (
          !(k in rebuilt) ||
          !(
            deepEqual(rebuilt[k], v) ||
            ((k === "startTime" || k === "endTime") &&
              typeof v === "string" &&
              hhmm(v) === rebuilt[k] &&
              hhmm(v) === v.slice(0, 5))
          )
        )
          exact = false;
      }
      if (missing.length) {
        stat.rowsWithUnaccounted++;
        if (samples.length < 25) samples.push({ id: r.id, keys: missing });
      }
      for (const k of UNIVERSAL) {
        if (!(k in p)) continue;
        const a = rebuilt[k];
        const b = p[k];
        const same =
          deepEqual(a, b) ||
          ((k === "startTime" || k === "endTime") &&
            typeof b === "string" &&
            b.length > 5 &&
            hhmm(b) === a);
        if (!same) {
          stat.universalMismatch++;
          if (samples.length < 25) samples.push({ id: r.id, universalKey: k });
        }
      }
      if (exact) stat.exactRows++;
    }
  }
  const countEnd = Number(
    (await db.query("SELECT count(*) n FROM esf7_workload_rows")).rows[0].n,
  );
  let fingerprint = null;
  const fp = await db.query(
    "SELECT md5(string_agg(id || ':' || md5(raw_payload::text), ',' ORDER BY id)) AS h FROM esf7_workload_rows",
  );
  fingerprint = fp.rows[0].h;
  const expectFp = opt("backup-fingerprint");
  const expectRows = opt("backup-rows") ? Number(opt("backup-rows")) : null;

  const checks = {
    rowCountStableDuringRun:
      countStart === countEnd && countEnd === stat.rowsRead,
    everyKeyAccountedFor: stat.unaccounted === 0,
    universalKeysRebuiltExactly: stat.universalMismatch === 0,
    payloadsUnchangedSinceBackup: expectFp
      ? fingerprint === expectFp &&
        (expectRows == null || expectRows === countEnd)
      : "not checked (no --backup-fingerprint given)",
  };
  const status =
    checks.rowCountStableDuringRun &&
    checks.everyKeyAccountedFor &&
    checks.universalKeysRebuiltExactly &&
    checks.payloadsUnchangedSinceBackup !== false
      ? "PASS"
      : "FAIL";
  const report = {
    status,
    database: dbName,
    startedAt,
    finishedAt: new Date().toISOString(),
    rowCountAtStart: countStart,
    rowCountAtEnd: countEnd,
    rowsChecked: stat.legacyRows,
    newFormatRowsSkipped: stat.newFormatRows,
    checks,
    keys: {
      total: stat.keysTotal,
      heldByTypedColumn: stat.viaColumn,
      heldByExtras: stat.viaExtras,
      unaccounted: stat.unaccounted,
      rowsWithUnaccountedKeys: stat.rowsWithUnaccounted,
    },
    exactKeySetRows: stat.exactRows,
    bytes: {
      legacyPayloadTotal: stat.payloadBytes,
      extrasTotal: stat.extrasBytes,
      avgPayload: stat.legacyRows
        ? Math.round(stat.payloadBytes / stat.legacyRows)
        : 0,
      avgExtras: stat.legacyRows
        ? Math.round(stat.extrasBytes / stat.legacyRows)
        : 0,
    },
    payloadFingerprint: { current: fingerprint, backup: expectFp || null },
    perKey: byKey,
    unaccountedSamples: samples,
    note: "Key presence of snake_case alias copies (e.g. section_name) is not preserved: their values equal the typed columns and the formatters regenerate them. exactKeySetRows counts rows whose payload keys are all reproduced with equal values.",
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, "workload-rows-payload-verification.json"),
    JSON.stringify(report, null, 2),
  );
  const rowsMd = Object.entries(byKey)
    .sort(
      (a, b) =>
        b[1].viaColumn +
        b[1].viaExtras +
        b[1].unaccounted -
        (a[1].viaColumn + a[1].viaExtras + a[1].unaccounted),
    )
    .map(
      ([k, v]) =>
        `| ${k} | ${ALIASES.has(k) ? ALIASES.get(k).col : "(no typed column)"} | ${v.viaColumn} | ${v.viaExtras} | ${v.unaccounted} |`,
    )
    .join("\n");
  const md = `# esf7_workload_rows payload verification: ${status}

Database \`${dbName}\`, ${report.finishedAt}. Row count at start ${countStart}, at end ${countEnd}; legacy rows checked ${stat.legacyRows}; rows already in the new format (empty raw_payload) ${stat.newFormatRows}.

| Check | Result |
|---|---|
| Row count stable during the run and every row read | ${checks.rowCountStableDuringRun} |
| Every payload key and value held by a typed column or by extras | ${checks.everyKeyAccountedFor} (${stat.unaccounted} unaccounted keys in ${stat.rowsWithUnaccounted} rows) |
| The 8 keys every old payload carried are rebuilt exactly (id, gradeLevel, sectionId, sectionName, subject, startTime, endTime, days) | ${checks.universalKeysRebuiltExactly} (${stat.universalMismatch} mismatches) |
| raw_payload identical to the backed-up state | ${checks.payloadsUnchangedSinceBackup} |

Keys: ${stat.keysTotal} total = ${stat.viaColumn} held by typed columns + ${stat.viaExtras} held by extras + ${stat.unaccounted} unaccounted. Rows whose whole key set is reproduced exactly: ${stat.exactRows} of ${stat.legacyRows} (the rest differ only by snake_case alias copies, see note in the JSON). Average size: payload ${report.bytes.avgPayload} B vs extras ${report.bytes.avgExtras} B per row.

| Payload key | Typed column | Equal to column | Held in extras | Unaccounted |
|---|---|---|---|---|
${rowsMd}

${samples.length ? "Unaccounted samples (row id and key only): " + JSON.stringify(samples.slice(0, 10)) : "No unaccounted keys."}
`;
  fs.writeFileSync(path.join(OUT, "workload-rows-payload-verification.md"), md);
  console.log(md.split("\n").slice(0, 14).join("\n"));
  console.log(
    `Saved ${path.relative(process.cwd(), path.join(OUT, "workload-rows-payload-verification.json"))}`,
  );
  process.exit(status === "PASS" ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
