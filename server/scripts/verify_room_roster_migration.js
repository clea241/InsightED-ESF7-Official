/**
 * Read-only post-run checks for the esf7_room_roster_cache migration.
 *
 * Usage:
 *   node scripts/verify_room_roster_migration.js [--school 300488[,...]] [--run-dir <dir of a migration run>] [--backup <backup_*.json>] [--out-dir <dir>] [--allow-skip]
 *
 * --run-dir  folder written by disaggregate_room_roster_cache.js (summary.json, existing_won.json, needs_review.json).
 *            Needed for checks 3 and 4; without it those checks are SKIPPED, and a skip fails the run unless --allow-skip.
 * Exit code 0 only if every check passes. Never writes to the database.
 */
const path = require("path");
const fs = require("fs");
const readline = require("readline");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const db = require("../db");

const ALLOWED_DATABASES = new Set(["esf7_local", "insighted_esf7"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

async function main() {
  const host = String(process.env.DB_HOST || "").toLowerCase();
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") throw new Error("FATAL: NODE_ENV=production");
  if (!LOOPBACK_HOSTS.has(host)) throw new Error(`FATAL: DB_HOST "${host}" is not loopback`);
  const dbName = (await db.query("SELECT current_database() AS d")).rows[0].d;
  if (!ALLOWED_DATABASES.has(dbName)) throw new Error(`FATAL: database "${dbName}" not in allowlist`);

  const schools = (arg("--school") || "").split(",").map((s) => s.trim().replace(/^SCH-/i, "")).filter(Boolean);
  const runDir = arg("--run-dir");
  const backupPath = arg("--backup");
  const allowSkip = process.argv.includes("--allow-skip");
  const outDir = path.resolve(arg("--out-dir") || runDir || ".");
  fs.mkdirSync(outDir, { recursive: true });

  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(runDir, f), "utf8")); } catch { return null; } };
  const summary = runDir ? readJson("summary.json") : null;
  const existingWon = runDir ? readJson("existing_won.json") : null;
  const needsReview = runDir ? readJson("needs_review.json") : null;

  const ids = schools.length ? schools : (await db.query("SELECT school_id FROM esf7_room_roster_cache ORDER BY school_id")).rows.map((r) => r.school_id);

  // 1. every personnel id of the selected cache payloads exists in esf7_personnel_profile
  const flaggedIds = new Set((needsReview || []).filter((r) => r.id && ["missing_prn", "missing_name", "no_id", "prn_collision_in_payload"].includes(r.kind)).map((r) => `${r.schoolId}|${r.id}`));
  let total = 0, found = 0, intentional = 0; const missing = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const rows = (await db.query("SELECT school_id, roster_json FROM esf7_room_roster_cache WHERE school_id = ANY($1::text[])", [batch])).rows;
    const wanted = []; const prns = [];
    for (const r of rows) for (const p of Array.isArray(r.roster_json) ? r.roster_json : []) {
      if (!p || !p.id) continue;
      wanted.push({ school: r.school_id, id: String(p.id), prn: p.prn ? String(p.prn).trim() : null });
      if (p.prn) prns.push(String(p.prn).trim());
    }
    const legacy = new Set(); const prnSet = new Set(); const idSet = new Set();
    const hit = (await db.query("SELECT id, legacy_id, prn, school_id FROM esf7_personnel_profile WHERE school_id = ANY($1::text[]) OR legacy_id = ANY($2::text[]) OR prn = ANY($3::text[])",
      [batch, [...new Set(wanted.map((w) => w.id))], prns.length ? prns : ["__none__"]])).rows;
    hit.forEach((h) => { if (h.legacy_id) legacy.add(`${h.school_id}|${h.legacy_id}`); if (h.prn) prnSet.add(h.prn); idSet.add(h.id); });
    for (const w of wanted) {
      total++;
      if (legacy.has(`${w.school}|${w.id}`) || (w.prn && prnSet.has(w.prn)) || idSet.has(w.id)) found++;
      else if (flaggedIds.has(`${w.school}|${w.id}`)) intentional++;
      else if (missing.length < 50) missing.push(`${w.school}:${w.id}`);
      else missing.push(null);
    }
  }
  const missCount = total - found - intentional;
  add("1. every cache personnel id exists in esf7_personnel_profile", missCount === 0 ? "PASS" : "FAIL",
    `${total} ids: ${found} present, ${intentional} intentionally skipped (flagged in needs_review), ${missCount} missing${missing.length ? " e.g. " + missing.filter(Boolean).slice(0, 5).join(", ") : ""}`);

  // 2. FK orphan check discovered from pg_constraint
  const fks = (await db.query(`SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, c.convalidated
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
     WHERE c.confrelid = 'esf7_personnel_profile'::regclass AND c.contype = 'f' ORDER BY 1, 2`)).rows;
  const orphans = [];
  for (const fk of fks) {
    const r = await db.query(`SELECT count(*)::int AS n FROM ${fk.tbl} c WHERE c.${fk.col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM esf7_personnel_profile p WHERE p.id = c.${fk.col}::text)`);
    if (r.rows[0].n) orphans.push(`${fk.tbl}.${fk.col}=${r.rows[0].n}`);
  }
  add(`2. FK orphans across ${fks.length} constraints referencing esf7_personnel_profile(id)`, orphans.length === 0 ? "PASS" : "FAIL",
    orphans.length ? orphans.join(", ") : `0 orphans (expected 20 constraints, found ${fks.length}${fks.length === 20 ? "" : " - DIFFERS"})`);

  // 3. rows that existed before the run keep their id / legacy_id
  if (!existingWon) add("3. non-canonical ids that existed before the run are unchanged", "SKIP", "pass --run-dir");
  else {
    const rows = existingWon.filter((w) => !String(w.cacheId).startsWith("PER-"));
    const ok = rows.length ? (await db.query("SELECT count(*)::int AS n FROM esf7_personnel_profile WHERE id = ANY($1::text[])", [rows.map((r) => r.normalizedId)])).rows[0].n : 0;
    const lgRows = rows.filter((r) => r.matchedOn === "legacy_id");
    const lg = lgRows.length ? (await db.query("SELECT count(*)::int AS n FROM esf7_personnel_profile p JOIN unnest($1::text[], $2::text[]) AS x(id, legacy) ON p.id = x.id AND p.legacy_id = x.legacy", [lgRows.map((r) => r.normalizedId), lgRows.map((r) => r.cacheId)])).rows[0].n : 0;
    add("3. non-canonical ids that existed before the run are unchanged", ok === rows.length && lg === lgRows.length ? "PASS" : "FAIL",
      `${rows.length} non-canonical ids matched existing rows; ${ok} still present under the same primary key`);
  }

  // 4. cache row count and size unchanged
  const now = (await db.query("SELECT count(*)::int AS n, COALESCE(sum(pg_column_size(roster_json)),0)::bigint AS payload, pg_total_relation_size('esf7_room_roster_cache')::bigint AS total FROM esf7_room_roster_cache")).rows[0];
  if (!summary) add("4. cache row count and pg_total_relation_size unchanged", "SKIP", "pass --run-dir");
  else {
    const b = summary.cache_before;
    const same = b.rows === now.n && b.payload_bytes === String(now.payload) && b.total_relation_bytes === String(now.total);
    add("4. cache row count and pg_total_relation_size unchanged", same ? "PASS" : "FAIL", `before ${JSON.stringify(b)} / now {"rows":${now.n},"payload_bytes":"${now.payload}","total_relation_bytes":"${now.total}"}`);
  }

  // 4b. optional: backup still equals the cache
  if (backupPath) {
    let n = 0, diff = 0;
    const rl = readline.createInterface({ input: fs.createReadStream(backupPath), crlfDelay: Infinity });
    for await (let line of rl) {
      if (!/^,?\{"school_id"/.test(line)) continue;
      const b = JSON.parse(line.replace(/^,/, ""));
      if (schools.length && !schools.includes(b.school_id)) continue;
      const cur = (await db.query("SELECT roster_json FROM esf7_room_roster_cache WHERE school_id = $1", [b.school_id])).rows[0];
      n++;
      if (!cur || JSON.stringify(cur.roster_json) !== JSON.stringify(b.roster_json)) diff++;
    }
    add("4b. backup file equals current cache rows", diff === 0 && n > 0 ? "PASS" : "FAIL", `${n} rows compared, ${diff} differ`);
  }

  // 5. cache-only schools
  const co = (await db.query("SELECT count(*)::int AS n FROM esf7_room_roster_cache c WHERE NOT EXISTS (SELECT 1 FROM esf7_personnel_profile p WHERE p.school_id = c.school_id)")).rows[0].n;
  const start = summary ? summary.schools.cache_only_total_before : null;
  add("5. schools that exist only in the cache", "INFO", `${co} still without normalized personnel${start !== null ? ` (was ${start} before that run; 592 expected at the very start)` : " (592 expected at the very start)"}`);

  const failed = checks.filter((c) => c.status === "FAIL").length;
  const skipped = checks.filter((c) => c.status === "SKIP").length;
  const ok = failed === 0 && (skipped === 0 || allowSkip);
  console.log("\n" + checks.map((c) => `${c.status.padEnd(5)} ${c.name}\n      ${c.detail}`).join("\n"));
  console.log(`\nRESULT: ${ok ? "PASS" : "FAIL"} (${failed} failed, ${skipped} skipped)`);
  fs.writeFileSync(path.join(outDir, "verify.json"), JSON.stringify({ database: dbName, schools: schools.length ? schools : "all", checks, passed: ok }, null, 2));
  return ok;
}

main()
  .then((ok) => db.closeAllPools?.().then(() => process.exit(ok ? 0 : 1)))
  .catch((e) => { console.error(e.message); process.exit(1); });
