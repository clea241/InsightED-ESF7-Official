#!/usr/bin/env node
// Runs EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) for ONE read-only query on the local test DB and summarizes it.
// Usage: node explain-query.mjs (--sql "<SELECT ...>" | --file query.sql) [--params '[1,"x"]'] [--name my-query] [--env DATABASE_URL] [--out docs/orm-optimizer/plans]
// Only SELECT / WITH ... SELECT is accepted. Runs in a READ ONLY transaction that is always rolled back, statement_timeout 30s.
// Writes <out>/<name>.json (raw EXPLAIN JSON of the recorded run) and <out>/<name>.sql (query + params).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assertLocalDb } from "./guard-local-db.mjs";

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : undefined; };
const here = path.dirname(fileURLToPath(import.meta.url));

function loadPg() {
  for (const base of [process.cwd(), path.join(process.cwd(), "server"), here]) {
    try { return createRequire(path.join(base, "noop.js"))("pg"); } catch { /* try next */ }
  }
  throw new Error('Cannot find the "pg" package from the working directory, ./server, or the skill folder.');
}

export function isExplainable(sql) {
  // strip comments and string/quoted-identifier contents, then inspect what is left
  const bare = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "''")
    .trim()
    .replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(bare)) return { ok: false, reason: "only SELECT or WITH ... SELECT statements are explained" };
  if (bare.includes(";")) return { ok: false, reason: "multiple statements are not allowed" };
  const bad = bare.match(/\b(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|copy|call|do|vacuum|analyze|into|listen|notify|set|reset|lock)\b/i);
  if (bad) return { ok: false, reason: `contains "${bad[1]}" (write, locking or session-changing keyword)` };
  return { ok: true };
}

function walk(node, fn, parent = null) {
  fn(node, parent);
  for (const c of node.Plans || []) walk(c, fn, node);
}

async function main() {
  let sql = opt("sql");
  if (!sql && opt("file")) sql = fs.readFileSync(opt("file"), "utf8");
  if (!sql) { console.error("Provide --sql or --file."); process.exit(2); }
  sql = sql.trim().replace(/;\s*$/, "");
  let params = [];
  if (opt("params")) {
    try { params = JSON.parse(opt("params")); if (!Array.isArray(params)) throw new Error("not an array"); }
    catch (e) { console.error(`--params must be a JSON array: ${e.message}`); process.exit(2); }
  }

  const verdict = isExplainable(sql);
  if (!verdict.ok) {
    console.log(`NOT VERIFIED: ${verdict.reason}. Report this query as "Not verified" (no statement was run).`);
    process.exit(3);
  }

  let target;
  try { target = assertLocalDb(opt("env") || "DATABASE_URL"); }
  catch (e) { console.error(`GUARD FAILED: ${e.message}`); process.exit(1); }

  const name = (opt("name") || "query-" + crypto.createHash("sha1").update(sql).digest("hex").slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "-");
  const outDir = path.resolve(opt("out") || "docs/orm-optimizer/plans");

  const { Client } = loadPg();
  const client = new Client({ connectionString: target.url, ssl: false, options: "-c default_transaction_read_only=on" });
  await client.connect();
  const explain = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
  let warm, rec, relRows = {};
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = 30000");
    await client.query("SET LOCAL lock_timeout = 5000");
    warm = (await client.query({ text: explain, values: params })).rows[0]["QUERY PLAN"];
    rec = (await client.query({ text: explain, values: params })).rows[0]["QUERY PLAN"];
    const rels = new Set();
    walk(rec[0].Plan, (n) => { if (n["Relation Name"]) rels.add(`${n.Schema || "public"}.${n["Relation Name"]}`); });
    for (const r of rels) {
      const [s, t] = r.split(".");
      const x = await client.query("select c.reltuples::bigint as est, (select n_live_tup from pg_stat_user_tables where relid = c.oid) as live from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = $1 and c.relname = $2", [s, t]);
      const row = x.rows[0] || {};
      relRows[r] = Math.max(Number(row.est) || 0, Number(row.live) || 0);
    }
  } catch (e) {
    console.error(`EXPLAIN failed: ${e.message}`);
    process.exitCode = 4;
  } finally {
    try { await client.query("ROLLBACK"); } catch { /* connection may be gone */ }
    await client.end().catch(() => {});
  }
  if (!rec) process.exit(process.exitCode || 4);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rec, null, 2));
  fs.writeFileSync(path.join(outDir, `${name}.sql`), `-- params: ${JSON.stringify(params)}\n-- database: ${target.database}\n${sql};\n`);

  const root = rec[0].Plan;
  const lines = [];
  lines.push(`Query: ${name}   database=${target.database}`);
  lines.push(`Top node: ${root["Node Type"]}${root["Relation Name"] ? " on " + root["Relation Name"] : ""}`);
  lines.push(`Rows at top node: estimated ${root["Plan Rows"]} vs actual ${root["Actual Rows"]} (loops ${root["Actual Loops"]})`);
  lines.push(`Actual total time: warm run ${warm[0]["Execution Time"].toFixed(3)} ms, recorded run ${rec[0]["Execution Time"].toFixed(3)} ms; planning ${rec[0]["Planning Time"].toFixed(3)} ms`);
  const seq = [], spills = [], misest = [];
  walk(root, (n) => {
    const loops = n["Actual Loops"] || 1;
    if (n["Node Type"] === "Seq Scan") {
      const key = `${n.Schema || "public"}.${n["Relation Name"]}`;
      const size = relRows[key] || 0;
      seq.push({ rel: n["Relation Name"], tableRows: size, scanned: Math.round(((n["Actual Rows"] || 0) + (n["Rows Removed by Filter"] || 0)) * loops), time: (n["Actual Total Time"] || 0) * loops, big: size > 10000 });
    }
    if (n["Sort Space Type"] === "Disk") spills.push(`Sort on disk (${n["Sort Space Used"]} kB, method ${n["Sort Method"]})`);
    if ((n["Hash Batches"] || 1) > 1) spills.push(`Hash spilled to ${n["Hash Batches"]} batches`);
    if (n["Temp Written Blocks"]) spills.push(`${n["Node Type"]} wrote ${n["Temp Written Blocks"]} temp blocks`);
    const est = n["Plan Rows"], act = n["Actual Rows"];
    if (est != null && act != null && (n["Actual Loops"] || 1) === 1) {
      const ratio = Math.max((act + 1) / (est + 1), (est + 1) / (act + 1));
      if (ratio >= 10) misest.push(`${n["Node Type"]}${n["Relation Name"] ? " on " + n["Relation Name"] : ""}: est ${est} vs actual ${act}`);
    }
  });
  const big = seq.filter((s) => s.big);
  lines.push(`Sequential scans on tables > 10,000 rows: ${big.length ? big.map((s) => `${s.rel} (~${s.tableRows} rows, read ${s.scanned}, ${s.time.toFixed(2)} ms)`).join("; ") : "none"}`);
  const small = seq.filter((s) => !s.big);
  if (small.length) lines.push(`Sequential scans on small tables (usually fine): ${small.map((s) => `${s.rel} (~${s.tableRows} rows)`).join("; ")}`);
  lines.push(`Sort/hash spills to disk: ${spills.length ? spills.join("; ") : "none"}`);
  lines.push(`Buffers (whole query): shared hit ${root["Shared Hit Blocks"] ?? 0}, shared read ${root["Shared Read Blocks"] ?? 0}, temp read/written ${root["Temp Read Blocks"] ?? 0}/${root["Temp Written Blocks"] ?? 0}`);
  if (misest.length) lines.push(`Row estimate off by >=10x: ${misest.slice(0, 5).join("; ")}`);
  lines.push(`Largest table rows seen (estimate): ${Object.entries(relRows).map(([k, v]) => `${k}=${v}`).join(", ") || "n/a"}`);
  lines.push(`Saved: ${path.relative(process.cwd(), path.join(outDir, name + ".json")).split(path.sep).join("/")}`);
  console.log(lines.join("\n"));
}

main().catch((e) => { console.error(e.message); process.exit(4); });
