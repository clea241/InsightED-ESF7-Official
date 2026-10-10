// Generic expand -> backfill -> verify -> drop for tables that keep a whole copy of the request body in raw_payload.
// Same steps and safety rules as the esf7_workload_rows pilot (see docs/orm-optimizer/workload-rows-payload-pilot.md).
//
//   node migrations/payload_extras.js expand   <table>
//   node migrations/payload_extras.js backfill <table> [--apply] [--batch 5000]       (dry run by default; idempotent; never touches raw_payload)
//   node migrations/payload_extras.js verify   <table> [--backup-fingerprint <md5> --backup-rows <n>]
//   node migrations/payload_extras.js drop     <table> --backup <dump file> [--confirm] [--rewrite] [--max-age-hours 24]
//   common: --allow-non-local (only after a successful local rehearsal)
// verify writes docs/orm-optimizer/<table>-payload-verification.{json,md} (key names and counts only, never values); drop refuses
// unless that report is PASS for this database and the current row count, no legacy payload was written after it started, a backup
// file is named, and --confirm is given. Fingerprint = md5(string_agg(id || ':' || md5(raw_payload::text), ',' ORDER BY id)).
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../db");
const { TABLES, codec, deepEqual } = require("../utils/payloadExtras");

const [cmd, table, ...rest] = process.argv.slice(2);
const argv = rest;
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? argv[i + 1] : d;
};
const BATCH = Number(opt("batch", 5000));
const OUT = path.join(__dirname, "..", "..", "docs", "orm-optimizer");
const fail = (m, code = 2) => {
  console.error(`REFUSED: ${m}`);
  process.exit(code);
};
if (!["expand", "backfill", "verify", "drop"].includes(cmd) || !TABLES[table])
  fail(
    `usage: payload_extras.js <expand|backfill|verify|drop> <${Object.keys(TABLES).join("|")}>`,
  );
const T = `"${table}"`;
const cd = codec(table);
const typedCols = Object.entries(TABLES[table].columns)
  .map(([c, k]) => (k === "time" ? `to_char(${c}, 'HH24:MI:SS') AS ${c}` : c))
  .join(", ");

async function target() {
  const who = await db.query(
    "SELECT current_database() AS db, inet_server_addr()::text AS host",
  );
  const { db: dbName, host } = who.rows[0];
  console.log(
    `Target database: ${dbName} (${host || "local socket"})  table: ${table}  command: ${cmd}`,
  );
  const addr = String(host || "").replace(/\/\d+$/, "");
  const isLocal = addr === "" || addr === "::1" || addr.startsWith("127.");
  if (!isLocal && !argv.includes("--allow-non-local"))
    fail(
      "target is not local; rehearse on the local database first, then pass --allow-non-local.",
    );
  return dbName;
}
const hasCol = async (c) =>
  (
    await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2",
      [table, c],
    )
  ).rows.length > 0;

async function expand() {
  await db.query(
    `ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb`,
  );
  console.log(`${table}.extras ready (raw_payload untouched).`);
}

async function backfill() {
  const APPLY = argv.includes("--apply");
  if (!(await hasCol("extras")))
    fail("extras column missing; run expand first.");
  const stats = {
    legacyRows: 0,
    skippedNewFormat: 0,
    unchanged: 0,
    toUpdate: 0,
    updated: 0,
    raced: 0,
    extrasBytes: 0,
    extrasKeys: {},
  };
  let last = "";
  for (;;) {
    const { rows } = await db.query(
      `SELECT id, raw_payload, extras, ${typedCols} FROM ${T} WHERE id > $1 ORDER BY id LIMIT $2`,
      [last, BATCH],
    );
    if (!rows.length) break;
    last = rows[rows.length - 1].id;
    const upd = [];
    for (const r of rows) {
      const p = r.raw_payload;
      if (!p || typeof p !== "object" || !Object.keys(p).length) {
        stats.skippedNewFormat++;
        continue;
      }
      stats.legacyRows++;
      const extras = cd.buildExtras(p, r, { dropEcho: false });
      if (deepEqual(extras, r.extras || {})) {
        stats.unchanged++;
        continue;
      }
      stats.toUpdate++;
      stats.extrasBytes += JSON.stringify(extras).length;
      for (const k of Object.keys(extras))
        stats.extrasKeys[k] = (stats.extrasKeys[k] || 0) + 1;
      upd.push({
        id: r.id,
        old: JSON.stringify(p),
        extras: JSON.stringify(extras),
      });
    }
    if (APPLY && upd.length) {
      const res = await db.query(
        `UPDATE ${T} t SET extras = v.extras::jsonb FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS old, unnest($3::text[]) AS extras) v
          WHERE t.id = v.id AND t.raw_payload = v.old::jsonb`,
        [upd.map((u) => u.id), upd.map((u) => u.old), upd.map((u) => u.extras)],
      );
      stats.updated += res.rowCount;
      stats.raced += upd.length - res.rowCount;
    }
  }
  const top = Object.entries(stats.extrasKeys)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
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
      1,
    ),
  );
  console.log(
    APPLY
      ? stats.raced
        ? `${stats.raced} rows changed while running; run again.`
        : "Applied."
      : "Dry run only: nothing was written. Re-run with --apply after review.",
  );
}

async function verify(dbName) {
  const startedAt = new Date().toISOString();
  if (!(await hasCol("raw_payload")))
    fail(
      "raw_payload is already gone; nothing to verify against (use the backup).",
    );
  const countStart = Number(
    (await db.query(`SELECT count(*) n FROM ${T}`)).rows[0].n,
  );
  const byKey = {};
  const st = {
    rowsRead: 0,
    legacyRows: 0,
    newFormatRows: 0,
    keysTotal: 0,
    viaColumn: 0,
    viaExtras: 0,
    unaccounted: 0,
    rowsWithUnaccounted: 0,
    payloadBytes: 0,
    extrasBytes: 0,
  };
  const samples = [];
  let last = "";
  for (;;) {
    const { rows } = await db.query(
      `SELECT id, raw_payload, extras, ${typedCols} FROM ${T} WHERE id > $1 ORDER BY id LIMIT $2`,
      [last, BATCH],
    );
    if (!rows.length) break;
    last = rows[rows.length - 1].id;
    for (const r of rows) {
      st.rowsRead++;
      const p = r.raw_payload;
      if (!p || typeof p !== "object" || !Object.keys(p).length) {
        st.newFormatRows++;
        continue;
      }
      st.legacyRows++;
      st.payloadBytes += JSON.stringify(p).length;
      st.extrasBytes += JSON.stringify(r.extras || {}).length;
      const missing = cd.unaccountedKeys(p, r);
      for (const [k, v] of Object.entries(p)) {
        const e = (byKey[k] ||= { viaColumn: 0, viaExtras: 0, unaccounted: 0 });
        st.keysTotal++;
        if (missing.includes(k)) (e.unaccounted++, st.unaccounted++);
        else if (
          Object.prototype.hasOwnProperty.call(r.extras || {}, k) &&
          deepEqual(r.extras[k], v)
        )
          (e.viaExtras++, st.viaExtras++);
        else (e.viaColumn++, st.viaColumn++);
      }
      if (missing.length) {
        st.rowsWithUnaccounted++;
        if (samples.length < 25) samples.push({ id: r.id, keys: missing });
      }
    }
  }
  const countEnd = Number(
    (await db.query(`SELECT count(*) n FROM ${T}`)).rows[0].n,
  );
  const fingerprint = (
    await db.query(
      `SELECT md5(string_agg(id || ':' || md5(raw_payload::text), ',' ORDER BY id)) h FROM ${T}`,
    )
  ).rows[0].h;
  const expectFp = opt("backup-fingerprint");
  const expectRows = opt("backup-rows") ? Number(opt("backup-rows")) : null;
  const checks = {
    rowCountStableDuringRun:
      countStart === countEnd && countEnd === st.rowsRead,
    everyKeyAccountedFor: st.unaccounted === 0,
    payloadsUnchangedSinceBackup: expectFp
      ? fingerprint === expectFp &&
        (expectRows == null || expectRows === countEnd)
      : "not checked (no --backup-fingerprint given)",
  };
  const status =
    checks.rowCountStableDuringRun &&
    checks.everyKeyAccountedFor &&
    checks.payloadsUnchangedSinceBackup !== false
      ? "PASS"
      : "FAIL";
  const report = {
    status,
    table,
    database: dbName,
    startedAt,
    finishedAt: new Date().toISOString(),
    rowCountAtStart: countStart,
    rowCountAtEnd: countEnd,
    rowsChecked: st.legacyRows,
    newFormatRowsSkipped: st.newFormatRows,
    checks,
    keys: {
      total: st.keysTotal,
      heldByTypedColumn: st.viaColumn,
      heldByExtras: st.viaExtras,
      unaccounted: st.unaccounted,
      rowsWithUnaccountedKeys: st.rowsWithUnaccounted,
    },
    bytes: {
      avgPayload: st.legacyRows
        ? Math.round(st.payloadBytes / st.legacyRows)
        : 0,
      avgExtras: st.legacyRows ? Math.round(st.extrasBytes / st.legacyRows) : 0,
    },
    payloadFingerprint: { current: fingerprint, backup: expectFp || null },
    perKey: byKey,
    unaccountedSamples: samples,
    note: "Key presence of alias copies (a camelCase or snake_case spelling of a typed column with the same value) is not preserved; the formatters regenerate the ones the API returns.",
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, `${table}-payload-verification.json`),
    JSON.stringify(report, null, 2),
  );
  const rowsMd = Object.entries(byKey)
    .sort(
      (a, b) =>
        b[1].viaColumn + b[1].viaExtras - (a[1].viaColumn + a[1].viaExtras),
    )
    .map(
      ([k, v]) =>
        `| ${k} | ${cd.aliases.has(k) ? cd.aliases.get(k).col : "(no typed column)"} | ${v.viaColumn} | ${v.viaExtras} | ${v.unaccounted} |`,
    )
    .join("\n");
  fs.writeFileSync(
    path.join(OUT, `${table}-payload-verification.md`),
    `# ${table} payload verification: ${status}

Database \`${dbName}\`, ${report.finishedAt}. Rows at start ${countStart}, at end ${countEnd}; legacy rows checked ${st.legacyRows}; already new format ${st.newFormatRows}.

| Check | Result |
|---|---|
| Row count stable and every row read | ${checks.rowCountStableDuringRun} |
| Every payload key and value held by a typed column or by extras | ${checks.everyKeyAccountedFor} (${st.unaccounted} unaccounted keys in ${st.rowsWithUnaccounted} rows) |
| raw_payload identical to the backed-up state | ${checks.payloadsUnchangedSinceBackup} |

Keys: ${st.keysTotal} = ${st.viaColumn} held by typed columns + ${st.viaExtras} held by extras + ${st.unaccounted} unaccounted. Average per row: payload ${report.bytes.avgPayload} B vs extras ${report.bytes.avgExtras} B.

| Payload key | Typed column | Equal to column | Held in extras | Unaccounted |
|---|---|---|---|---|
${rowsMd}
`,
  );
  console.log(
    `${table}: ${status}  rows ${st.legacyRows}  keys ${st.keysTotal} (column ${st.viaColumn}, extras ${st.viaExtras}, unaccounted ${st.unaccounted})  avg payload ${report.bytes.avgPayload} B -> extras ${report.bytes.avgExtras} B`,
  );
  if (samples.length)
    console.log(
      "unaccounted samples (id, keys):",
      JSON.stringify(samples.slice(0, 5)),
    );
  process.exit(status === "PASS" ? 0 : 1);
}

async function drop(dbName) {
  if (!(await hasCol("raw_payload"))) {
    console.log("raw_payload is already gone; nothing to do.");
    return;
  }
  const rp = path.join(OUT, `${table}-payload-verification.json`);
  if (!fs.existsSync(rp))
    fail(`no verification report at ${rp}. Run verify first.`);
  const rep = JSON.parse(fs.readFileSync(rp, "utf8"));
  const ageH = (Date.now() - new Date(rep.finishedAt).getTime()) / 3600000;
  if (rep.status !== "PASS") fail(`verification status is ${rep.status}.`);
  if (rep.database !== dbName)
    fail(`verification was run on "${rep.database}", not "${dbName}".`);
  if (ageH > Number(opt("max-age-hours", 24)))
    fail(`verification is ${ageH.toFixed(1)} h old. Run it again.`);
  const n = Number((await db.query(`SELECT count(*) n FROM ${T}`)).rows[0].n);
  if (n !== rep.rowCountAtEnd)
    fail(
      `row count is ${n} but the verified count was ${rep.rowCountAtEnd}. Verify again.`,
    );
  const stale = Number(
    (
      await db.query(
        `SELECT count(*) n FROM ${T} WHERE raw_payload <> '{}'::jsonb AND updated_at > $1::timestamptz`,
        [rep.startedAt],
      )
    ).rows[0].n,
  );
  if (stale > 0)
    fail(
      `${stale} rows with a legacy payload were written after the verification started. Backfill and verify again.`,
    );
  const backup = opt("backup");
  if (!backup || !fs.existsSync(backup) || fs.statSync(backup).size === 0)
    fail("--backup <existing pg_dump file> is required.");
  console.log(
    `Verification PASS (${rep.rowsChecked} legacy rows, ${rep.keys.total} keys, 0 unaccounted), ${ageH.toFixed(1)} h old. Backup: ${backup}`,
  );
  if (!argv.includes("--confirm"))
    return console.log(
      `Dry run: all gates passed. Re-run with --confirm to drop ${table}.raw_payload.`,
    );
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`LOCK TABLE ${T} IN SHARE ROW EXCLUSIVE MODE`);
    const again = Number(
      (await client.query(`SELECT count(*) n FROM ${T}`)).rows[0].n,
    );
    if (again !== rep.rowCountAtEnd)
      throw new Error(`row count changed to ${again} while locking`);
    await client.query(`ALTER TABLE ${T} DROP COLUMN raw_payload`);
    await client.query("COMMIT");
    console.log(`Dropped ${table}.raw_payload.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`Aborted, column kept: ${e.message}`);
    process.exit(1);
  } finally {
    client.release();
  }
  if (argv.includes("--rewrite")) {
    await db.query(`VACUUM (FULL, ANALYZE) ${T}`);
    const s = (
      await db.query(
        `SELECT pg_size_pretty(pg_relation_size('${table}')) heap, pg_size_pretty(pg_total_relation_size('${table}')) total`,
      )
    ).rows[0];
    console.log(`Rewritten: heap ${s.heap}, total ${s.total}`);
  } else
    console.log(
      "Disk space is only reclaimed by a rewrite (--rewrite = VACUUM FULL, exclusive lock; or pg_repack).",
    );
}

(async () => {
  const dbName = await target();
  if (cmd === "expand") await expand();
  else if (cmd === "backfill") await backfill();
  else if (cmd === "verify") await verify(dbName);
  else await drop(dbName);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
