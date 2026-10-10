#!/usr/bin/env node
// Compares declared (schema.ts) and live indexes with columns used at the candidate sites. Read-only catalog queries only.
// Usage: node index-coverage.mjs [--candidates docs/orm-optimizer/plans/candidates.json] [--schema path/to/schema.ts] [--env DATABASE_URL]
//                                [--seq-scans 100] [--min-rows 10000] [--out docs/orm-optimizer/plans]
// Run scan-drizzle-queries.mjs first (it writes candidates.json). Writes <out>/index-coverage.md and prints it.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assertLocalDb } from "./guard-local-db.mjs";
import { parseSchema, findSchemaFile } from "./scan-drizzle-queries.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const here = path.dirname(fileURLToPath(import.meta.url));
const MIN_SEQ = Number(opt("seq-scans", 100));
const MIN_ROWS = Number(opt("min-rows", 10000));

function loadPg() {
  for (const base of [process.cwd(), path.join(process.cwd(), "server"), here]) {
    try { return createRequire(path.join(base, "noop.js"))("pg"); } catch { /* next */ }
  }
  throw new Error('Cannot find the "pg" package.');
}
const esc = (s) => String(s).replace(/\|/g, "\\|");
const table = (head, rows) => rows.length ? ["| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|", ...rows.map((r) => "| " + r.map(esc).join(" | ") + " |")].join("\n") : "_none_";
const mb = (b) => (Number(b) / 1048576).toFixed(1) + " MB";

async function main() {
  let target;
  try { target = assertLocalDb(opt("env", "DATABASE_URL")); }
  catch (e) { console.error(`GUARD FAILED: ${e.message}`); process.exit(1); }

  const candPath = path.resolve(opt("candidates", "docs/orm-optimizer/plans/candidates.json"));
  const cand = fs.existsSync(candPath) ? JSON.parse(fs.readFileSync(candPath, "utf8")) : { candidates: [], columnUsage: [] };
  const schemaPath = opt("schema") ? path.resolve(opt("schema")) : (cand.schemaPath && fs.existsSync(path.resolve(cand.schemaPath)) ? path.resolve(cand.schemaPath) : findSchemaFile(process.cwd()));
  const schema = schemaPath ? parseSchema(fs.readFileSync(schemaPath, "utf8")) : {};

  const { Client } = loadPg();
  const client = new Client({ connectionString: target.url, ssl: false, options: "-c default_transaction_read_only=on" });
  await client.connect();
  let idx, tabs, fks, dbstat, liveCols;
  try {
    await client.query("BEGIN READ ONLY");
    idx = (await client.query(`
      select s.relname as tbl, s.indexrelname as idx, s.idx_scan::bigint, pg_relation_size(s.indexrelid) as size,
             i.indisunique, i.indisprimary, pg_get_expr(i.indpred, i.indrelid) as pred,
             array(select coalesce(a.attname::text, '(expr)') from unnest(string_to_array(i.indkey::text, ' ')::int[]) with ordinality k(n, ord)
                   left join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n and k.n > 0 order by k.ord) as cols
      from pg_stat_user_indexes s join pg_index i on i.indexrelid = s.indexrelid where s.schemaname = 'public'`)).rows;
    tabs = (await client.query(`select relname as tbl, n_live_tup::bigint as live, seq_scan::bigint, seq_tup_read::bigint, idx_scan::bigint from pg_stat_user_tables where schemaname = 'public'`)).rows;
    fks = (await client.query(`
      select (select relname from pg_class where oid = c.conrelid) as tbl, c.conname,
             array(select a.attname::text from unnest(c.conkey) with ordinality k(n, ord) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.ord) as cols
      from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)).rows;
    liveCols = new Set((await client.query(`select table_name || '.' || column_name as k from information_schema.columns where table_schema = 'public'`)).rows.map((r) => r.k));
    dbstat = (await client.query(`select stats_reset from pg_stat_database where datname = current_database()`)).rows[0] || {};
  } finally {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    await client.end().catch(() => {});
  }

  const rowsOf = Object.fromEntries(tabs.map((t) => [t.tbl, Number(t.live)]));
  const out = [];
  const totalScans = tabs.reduce((a, t) => a + Number(t.seq_scan) + Number(t.idx_scan), 0);
  out.push(`# Index coverage (database \`${target.database}\`, read-only catalog queries)`, "");
  out.push(`Schema file: \`${schemaPath ? path.relative(process.cwd(), schemaPath).split(path.sep).join("/") : "not found"}\` (${Object.keys(schema).length} tables, ${Object.values(schema).reduce((a, t) => a + t.indexes.length, 0)} declared indexes). Live: ${idx.length} indexes on ${tabs.length} tables. Stats reset: ${dbstat.stats_reset ? new Date(dbstat.stats_reset).toISOString() : "never/unknown"}.`);
  const largest = [...tabs].sort((a, b) => Number(b.live) - Number(a.live)).slice(0, 5).map((t) => `${t.tbl}=${t.live}`).join(", ");
  out.push(`Largest tables (live rows): ${largest}.`, "");
  const statsThin = totalScans < 1000;
  if (statsThin) out.push(`> **Caution:** only ${totalScans} total scans recorded since the last stats reset. Usage statistics on a fresh or idle local DB are not evidence; treat the unused-index and sequential-scan sections as inconclusive.`, "");

  // 1. columns used at candidate sites without a leading live index
  const usage = (cand.columnUsage || []).filter((u) => liveCols.has(`${u.table}.${u.column}`)); // drops aliases/functions mis-read from raw SQL
  const liveByTbl = {};
  for (const i of idx) (liveByTbl[i.tbl] ||= []).push(i);
  const agg = new Map();
  for (const u of usage) {
    const k = `${u.table}.${u.column}`;
    const a = agg.get(k) || { table: u.table, column: u.column, kinds: new Set(), sites: [] };
    a.kinds.add(u.kind); a.sites.push(`${u.file}:${u.line}`);
    agg.set(k, a);
  }
  const missing = [];
  for (const a of agg.values()) {
    const live = liveByTbl[a.table];
    if (!live) continue; // table not in the local DB
    if (!live.some((i) => i.cols[0] === a.column)) {
      const rows = rowsOf[a.table] ?? 0;
      missing.push([a.table, a.column, [...a.kinds].join("/"), rows, rows < MIN_ROWS ? "low (small table)" : "check", [...new Set(a.sites)].slice(0, 3).join(", ") + (a.sites.length > 3 ? ` (+${a.sites.length - 3})` : "")]);
    }
  }
  missing.sort((x, y) => y[3] - x[3]);
  out.push("## Missing-index candidates (column used at a query site, no live index leads with it)", "");
  out.push(usage.length ? table(["table", "column", "used in", "live rows", "priority", "sites"], missing) : "_No column usage was extracted from the scan (no Drizzle query builders or single-table raw SELECTs matched)._", "");

  // 2. foreign keys without a supporting index
  const fkMissing = fks.filter((f) => !(liveByTbl[f.tbl] || []).some((i) => f.cols.every((c, n) => i.cols[n] === c)))
    .map((f) => [f.tbl, f.conname, f.cols.join(", "), rowsOf[f.tbl] ?? 0]).sort((a, b) => b[3] - a[3]);
  out.push("## Foreign keys without a supporting index (live)", "", table(["table", "constraint", "columns", "live rows"], fkMissing), "");

  // 3. schema.ts vs live drift
  const declared = Object.values(schema).flatMap((t) => t.indexes.filter((i) => i.kind !== "primary").map((i) => ({ tbl: t.name, name: i.name })));
  const liveNames = new Set(idx.map((i) => i.idx));
  const declNames = new Set(declared.map((d) => d.name));
  const declNotLive = declared.filter((d) => !liveNames.has(d.name) && liveByTbl[d.tbl]).map((d) => [d.tbl, d.name]);
  const liveNotDecl = idx.filter((i) => !i.indisprimary && !declNames.has(i.idx) && schema && Object.values(schema).some((t) => t.name === i.tbl)).map((i) => [i.tbl, i.idx, i.cols.join(", ")]);
  out.push("## Drift: declared in schema.ts but missing live", "", table(["table", "index"], declNotLive), "");
  out.push("## Drift: live but not declared in schema.ts", "", table(["table", "index", "columns"], liveNotDecl), "");

  // 4. unused indexes
  const unused = idx.filter((i) => Number(i.idx_scan) === 0 && !i.indisprimary && !i.indisunique)
    .map((i) => [i.tbl, i.idx, i.cols.join(", "), mb(i.size), rowsOf[i.tbl] ?? 0]).sort((a, b) => b[4] - a[4]);
  out.push("## Unused indexes (idx_scan = 0, not unique/primary)", "", statsThin ? "_Inconclusive: statistics are thin (see caution above)._" : table(["table", "index", "columns", "size", "table rows"], unused), "");

  // 5. duplicate / redundant
  const dup = [];
  for (const [tbl, list] of Object.entries(liveByTbl)) {
    for (let a = 0; a < list.length; a++) for (let b = 0; b < list.length; b++) {
      if (a === b) continue;
      const A = list[a], B = list[b];
      if (A.pred || B.pred || A.cols.includes("(expr)") || B.cols.includes("(expr)")) continue;
      const same = A.cols.join() === B.cols.join();
      if (same && a < b) dup.push([tbl, A.idx, B.idx, A.cols.join(", "), "duplicate"]);
      else if (!same && !A.indisunique && !A.indisprimary && A.cols.length < B.cols.length && A.cols.every((c, n) => B.cols[n] === c)) dup.push([tbl, A.idx, B.idx, `${A.cols.join(", ")} ⊂ ${B.cols.join(", ")}`, "redundant (prefix of another index)"]);
    }
  }
  out.push("## Duplicate or redundant indexes", "", table(["table", "index", "overlaps with", "columns", "kind"], dup), "");

  // 6. sequential scans
  const seq = tabs.filter((t) => Number(t.seq_scan) >= MIN_SEQ && Number(t.live) >= MIN_ROWS)
    .map((t) => [t.tbl, t.live, t.seq_scan, t.seq_tup_read, t.idx_scan]).sort((a, b) => Number(b[3]) - Number(a[3]));
  out.push(`## Tables with high sequential scan counts (>= ${MIN_SEQ} scans and >= ${MIN_ROWS} rows)`, "", statsThin ? "_Inconclusive: statistics are thin._" : table(["table", "live rows", "seq scans", "seq tuples read", "idx scans"], seq), "");
  out.push("_Counts are cumulative since the stats reset and reflect whatever workload ran on this local DB, not production traffic. Confirm any suspect with `explain-query.mjs` before reporting it as Verified._");

  const text = out.join("\n") + "\n";
  const outDir = path.resolve(opt("out", "docs/orm-optimizer/plans"));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index-coverage.md"), text);
  process.stdout.write(text);
}

main().catch((e) => { console.error(e.message); process.exit(4); });
