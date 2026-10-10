#!/usr/bin/env node
// "Duplicated JSON payload" check: tables that re-store submitted data in a raw_payload-style JSON/JSONB column
// while the same fields also exist as typed columns, and write code that puts the whole request body into it.
//
// Static part (imported by scan-drizzle-queries.mjs): payloadSchemaColumns(), payloadWriteSites().
// CLI (local test DB only, read-only):  node payload-columns.mjs [--candidates docs/orm-optimizer/plans/candidates.json]
//   [--schema path/to/schema.ts] [--env DATABASE_URL] [--out docs/orm-optimizer/plans] [--min-rows 1000] [--explain-rows 10000]
// For each JSON column it measures, inside a READ ONLY transaction that is rolled back: average/max pg_column_size of the column
// vs the rest of the row, heap vs TOAST vs index size, how many top-level JSON keys have a same-named typed column (key names and
// byte counts only; row contents are never printed or saved), and EXPLAIN (ANALYZE, BUFFERS) of reading the column vs a baseline.
// Writes <out>/payload-columns.json and payload-columns.md.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertLocalDb } from "./guard-local-db.mjs";

export const PAYLOAD_NAME = /^(?:raw_payload|payload|payload_json|raw_data|raw_body|request_body|body|data|raw|\w+_payload|\w+_data|\w+_json)$/i;
const WHOLE_VAR = /^\s*(?:body|payload|data|raw|rawPayload|record|row|r|item|entry|formatted|merged|obj|input)\s*$/;

function matchClose(t, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  let q = null;
  for (let i = open; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === ")" || c === "]" || c === "}") { stack.pop(); if (!stack.length) return i; }
  }
  return -1;
}

function splitTop(t) {
  const out = []; let d = 0, q = null, st = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if ("([{".includes(c)) d++;
    else if (")]}".includes(c)) d--;
    else if (c === "," && d === 0) { out.push(t.slice(st, i)); st = i + 1; }
  }
  if (t.slice(st).trim()) out.push(t.slice(st));
  return out.map((x) => x.trim());
}

/** JSON columns declared in schema.ts. payloadStyle = name looks like a stored request body. */
export function payloadSchemaColumns(schema) {
  const out = [];
  for (const t of Object.values(schema)) {
    for (const [prop, j] of Object.entries(t.jsonColumns || {})) {
      out.push({ table: t.name, column: j.dbName, prop, line: j.line, type: j.type, notNull: j.notNull, payloadStyle: PAYLOAD_NAME.test(j.dbName) });
    }
  }
  return out;
}

function resolveIdent(src, before, name) {
  if (!/^\w+$/.test(name)) return "";
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`, "g");
  let last = null, m;
  const head = src.slice(0, before);
  while ((m = re.exec(head))) last = m;
  if (!last) return "";
  const start = last.index + last[0].length;
  const c = src[start];
  if (c === "`") { const e = src.indexOf("`", start + 1); return e < 0 ? "" : src.slice(start, e + 1); }
  if (src.startsWith("JSON.stringify(", start)) { const e = matchClose(src, start + 14); return e < 0 ? "" : src.slice(start, e + 1); }
  if (c === "[" || c === "{" || c === "(") { const e = matchClose(src, start); return e < 0 ? "" : src.slice(start, e + 1); }
  return "";
}

/** Raw pg INSERT/UPDATE (and Drizzle .values/.set) sites that write a whole object into a payload-style column. */
export function payloadWriteSites(rel, src, schema = {}) {
  const byName = Object.fromEntries(Object.values(schema).map((t) => [t.name.toLowerCase(), t]));
  const sites = [];
  const lineOf = (i) => src.slice(0, i).split("\n").length;
  const re = /\.query\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, open);
    if (close < 0) continue;
    const stmt = src.slice(open, close + 1);
    const argsTop = stmt.slice(1, -1);
    // first and second argument text, resolving variables defined earlier in the file
    const parts = [];
    let depth = 0, q = null, s0 = 0;
    for (let i = 0; i < argsTop.length; i++) {
      const c = argsTop[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === "`") q = c;
      else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (c === "," && depth === 0) { parts.push(argsTop.slice(s0, i)); s0 = i + 1; }
    }
    parts.push(argsTop.slice(s0));
    const sqlText = /^\s*[\w$]+\s*$/.test(parts[0] || "") ? resolveIdent(src, m.index, parts[0].trim()) : parts[0] || "";
    const paramText = /^\s*[\w$]+\s*$/.test(parts[1] || "") ? resolveIdent(src, m.index, parts[1].trim()) : parts[1] || "";
    const sm = sqlText.match(/\b(INSERT\s+INTO|UPDATE)\s+"?(\w+)"?/i);
    if (!sm) continue;
    const table = sm[2].toLowerCase();
    const known = byName[table];
    const jsonCols = known ? Object.values(known.jsonColumns || {}).map((j) => j.dbName).filter((n) => PAYLOAD_NAME.test(n)) : null;
    const words = sqlText.match(/\b[a-z_]+\b/gi) || [];
    const col = (jsonCols ? words.find((w) => jsonCols.includes(w)) : words.find((w) => PAYLOAD_NAME.test(w) && !/^(data|raw|body)$/i.test(w))) || null;
    if (!col) continue;
    // which parameter feeds the payload column? INSERT: position of the column in the column list; UPDATE: "col = $n"
    let paramIdx = -1;
    const ins = sqlText.match(/INSERT\s+INTO\s+"?\w+"?\s*\(([^)]*)\)\s*VALUES\s*\(/i);
    if (ins) {
      const names = ins[1].split(",").map((x) => x.trim().replace(/"/g, ""));
      const vStart = sqlText.indexOf("(", ins.index + ins[0].length - 1);
      const vEnd = matchClose(sqlText, vStart);
      const vals = splitTop(sqlText.slice(vStart + 1, vEnd < 0 ? undefined : vEnd));
      const k = names.indexOf(col);
      const pm = k >= 0 && vals[k] ? vals[k].match(/^\$(\d+)/) : null;
      if (pm) paramIdx = Number(pm[1]) - 1;
    }
    if (paramIdx < 0) { const um = sqlText.match(new RegExp("\\b" + col + "\\s*=\\s*\\$(\\d+)")); if (um) paramIdx = Number(um[1]) - 1; }
    const elems = splitTop(paramText.trim().replace(/^\[|\]$/g, ""));
    let kind = null;
    const classify = (arg) => {
      if (/\breq\.body\b/.test(arg)) return "whole request body";
      if (/(?:^|[\s?:{,(]|\.\.\.)(?:req\.)?body\b(?!\s*[.\[])/.test(arg)) return "whole request body (merged or conditional)";
      if (/^\s*\{\s*\.\.\.\s*[\w.]+/.test(arg)) return "spread of a whole object plus extra fields";
      if (/^\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)*\s*$/.test(arg)) return "whole object variable";
      return null;
    };
    const stringifyArg = (expr) => {
      let e = expr.trim();
      if (/^[\w$]+$/.test(e)) e = resolveIdent(src, m.index, e) || e;
      const mm = e.match(/^JSON\.stringify\s*\(/);
      if (!mm) return null;
      const end = matchClose(e, mm[0].length - 1);
      return e.slice(mm[0].length, end < 0 ? undefined : end);
    };
    if (paramIdx >= 0 && elems[paramIdx] !== undefined) {
      const arg = stringifyArg(elems[paramIdx]);
      if (arg !== null) kind = classify(arg);
    } else {
      for (const el of elems) { const arg = stringifyArg(el); if (arg !== null && (kind = classify(arg)) && kind !== "whole object variable") break; kind = null; }
    }
    if (!kind) continue;
    sites.push({ line: lineOf(m.index), table, column: col, kind, snippet: `${sm[1].replace(/\s+/g, " ").toUpperCase()} ${table} (${col}) <- JSON.stringify(${kind})` });
  }
  // Drizzle builders: .values({ rawPayload: req.body }) / .set({ rawPayload: { ...x } })
  const dre = /\b(rawPayload|payload|payloadJson|rawData)\s*:\s*(req\.body\b|\{\s*\.\.\.)/g;
  while ((m = dre.exec(src))) if (/drizzle/i.test(src) && /\.(?:values|set)\s*\(\s*\{?[^;]{0,400}$/.test(src.slice(Math.max(0, m.index - 400), m.index))) sites.push({ line: lineOf(m.index), table: null, column: m[1], kind: m[2].startsWith("req.body") ? "whole request body" : "spread of a whole object plus extra fields", snippet: `drizzle ${m[1]}: ${m[2]}...`, drizzle: true });
  return sites;
}

// ------------------------------------------------------------------ CLI (database verification)
const toSnake = (k) => k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const mb = (b) => Math.round((Number(b) / 1048576) * 10) / 10;

async function cli() {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
  const here = path.dirname(fileURLToPath(import.meta.url));
  const MIN_ROWS = Number(opt("min-rows", 1000));
  const EXPLAIN_ROWS = Number(opt("explain-rows", 10000));
  let target;
  try { target = assertLocalDb(opt("env", "DATABASE_URL")); }
  catch (e) { console.error(`GUARD FAILED: ${e.message}`); process.exit(1); }

  const { parseSchema, findSchemaFile } = await import("./scan-drizzle-queries.mjs");
  const candPath = path.resolve(opt("candidates", "docs/orm-optimizer/plans/candidates.json"));
  const cand = fs.existsSync(candPath) ? JSON.parse(fs.readFileSync(candPath, "utf8")) : { candidates: [] };
  const schemaPath = opt("schema") ? path.resolve(opt("schema")) : (cand.schemaPath ? path.resolve(cand.schemaPath) : findSchemaFile(process.cwd()));
  if (!schemaPath || !fs.existsSync(schemaPath)) { console.error("schema.ts not found; pass --schema."); process.exit(2); }
  const schema = parseSchema(fs.readFileSync(schemaPath, "utf8"));
  const cols = payloadSchemaColumns(schema);
  const schemaRel = path.relative(process.cwd(), schemaPath).split(path.sep).join("/");
  const writes = (cand.candidates || []).filter((c) => c.pattern === "payload-write-whole-body");

  let createRequireBase = [process.cwd(), path.join(process.cwd(), "server"), here];
  let pg;
  for (const b of createRequireBase) { try { pg = createRequire(path.join(b, "noop.js"))("pg"); break; } catch { /* next */ } }
  if (!pg) { console.error('Cannot find the "pg" package.'); process.exit(2); }
  const client = new pg.Client({ connectionString: target.url, ssl: false, options: "-c default_transaction_read_only=on" });
  await client.connect();
  const results = [];
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = 30000");
    const live = new Map();
    for (const r of (await client.query(`select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'`)).rows) {
      if (!live.has(r.table_name)) live.set(r.table_name, new Map());
      live.get(r.table_name).set(r.column_name, r.data_type);
    }
    for (const c of cols) {
      const liveCols = live.get(c.table);
      const base = { table: c.table, column: c.column, type: c.type, payloadStyle: c.payloadStyle, schemaFile: schemaRel, line: c.line };
      if (!liveCols || !/^jsonb?$/.test(liveCols.get(c.column) || "")) { results.push({ ...base, verdict: "Static only", reason: "table or column not present in the local database" }); continue; }
      if (!/^[a-z0-9_]+$/i.test(c.table) || !/^[a-z0-9_]+$/i.test(c.column)) { results.push({ ...base, verdict: "Static only", reason: "unusual identifier, skipped" }); continue; }
      const T = `"${c.table}"`, C = `"${c.column}"`;
      const sz = (await client.query(
        `select c.reltuples::bigint as est, (select n_live_tup from pg_stat_user_tables where relid = c.oid) as live,
                pg_relation_size(c.oid) as heap, case when c.reltoastrelid = 0 then 0 else pg_relation_size(c.reltoastrelid) end as toast,
                pg_indexes_size(c.oid) as idx, pg_total_relation_size(c.oid) as total
         from pg_class c where c.oid = $1::regclass`, [`public.${c.table}`])).rows[0];
      const rows = Math.max(Number(sz.live) || 0, Number(sz.est) || 0);
      const pct = rows > 50000 ? Math.max(0.05, Math.min(100, (30000 / rows) * 100)) : 100;
      const sample = rows > 50000 ? `TABLESAMPLE SYSTEM (${pct.toFixed(3)})` : "";
      const st = (await client.query(
        `select count(*)::int as n, count(t.${C})::int as nn, coalesce(avg(pg_column_size(t.${C})),0)::int as avg_col, coalesce(max(pg_column_size(t.${C})),0)::int as max_col,
                coalesce(avg(pg_column_size(t.*) - coalesce(pg_column_size(t.${C}),0)),0)::int as avg_rest
         from ${T} as t ${sample}`)).rows[0];
      // key overlap (names + byte counts only)
      let keys = 0, keysWithCol = 0, bytesAll = 0, bytesDup = 0, objs = 0;
      const dupKeys = new Map(), onlyKeys = new Map();
      if (c.type === "jsonb" || c.type === "json") {
        const rowsJ = (await client.query(`select t.${C}::jsonb as v from ${T} as t ${sample} where t.${C} is not null limit 300`)).rows;
        for (const { v } of rowsJ) {
          if (!v || typeof v !== "object" || Array.isArray(v)) continue;
          objs++;
          for (const [k, val] of Object.entries(v)) {
            const b = JSON.stringify(val === undefined ? null : val).length;
            const hasCol = liveCols.has(toSnake(k)) && toSnake(k) !== c.column;
            keys++; bytesAll += b;
            if (hasCol) { keysWithCol++; bytesDup += b; dupKeys.set(k, (dupKeys.get(k) || 0) + 1); } else onlyKeys.set(k, (onlyKeys.get(k) || 0) + 1);
          }
        }
      }
      const dupShare = bytesAll ? bytesDup / bytesAll : 0;
      const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
      const r = {
        ...base, rows, sampledRows: st.n, nonNullRows: st.nn, objectsChecked: objs,
        avgColBytes: st.avg_col, maxColBytes: st.max_col, avgRestBytes: st.avg_rest,
        payloadShareOfRow: st.avg_col + st.avg_rest ? Math.round((st.avg_col / (st.avg_col + st.avg_rest)) * 100) : 0,
        heapMB: mb(sz.heap), toastMB: mb(sz.toast), indexMB: mb(sz.idx), totalMB: mb(sz.total),
        keysChecked: keys, keysWithTypedColumn: keysWithCol, duplicatedByteShare: Math.round(dupShare * 100),
        duplicatedKeys: top(dupKeys), payloadOnlyKeys: top(onlyKeys), sampleNote: sample ? `system sample ${pct.toFixed(2)}%` : "all rows",
      };
      if (!c.payloadStyle && objs < 30) { r.verdict = "Not applicable"; r.reason = "small array/scalar JSON column, not a stored request body"; }
      else if (rows < MIN_ROWS || st.nn < 30 || objs < 30) { r.verdict = "Static only"; r.reason = `only ${rows} rows (${st.nn} non-null) locally; too few to measure`; }
      else if (dupShare >= 0.3) { r.verdict = "Verified"; r.reason = `${Math.round(dupShare * 100)}% of the payload bytes sit under keys that also have a typed column`; }
      else { r.verdict = "Rejected"; r.reason = `only ${Math.round(dupShare * 100)}% of payload bytes duplicate typed columns; the payload mostly holds data with no column`; }
      // EXPLAIN evidence (reuses explain-query.mjs, which is guarded, SELECT-only and rolled back)
      if (rows >= EXPLAIN_ROWS && (r.verdict === "Verified" || r.verdict === "Rejected")) {
        // keep the scanned volume near 40 MB so very wide payloads (100 KB rows) do not hit the 30 s timeout
        const LIM = Math.min(20000, Math.max(200, Math.floor(40e6 / Math.max(1, st.avg_col))));
        const run = (name, sql) => {
          try {
            const out = execFileSync(process.execPath, [path.join(here, "explain-query.mjs"), "--name", name, "--sql", sql, "--out", path.resolve(opt("out", "docs/orm-optimizer/plans"))], { encoding: "utf8", env: process.env });
            const t = out.match(/recorded run ([\d.]+) ms/); const b = out.match(/shared hit (\d+), shared read (\d+)/);
            return { plan: `docs/orm-optimizer/plans/${name}.json`, ms: t ? Number(t[1]) : null, hit: b ? Number(b[1]) : null, read: b ? Number(b[2]) : null };
          } catch (e) { return { error: String(e.stdout || e.message).split("\n")[0] }; }
        };
        r.explainPayload = run(`payload-${c.table}-${c.column}`, `SELECT sum(length(s.v::text)) FROM (SELECT ${C} AS v FROM ${T} LIMIT ${LIM}) s`);
        r.explainBaseline = run(`payload-${c.table}-baseline`, `SELECT count(*) FROM (SELECT 1 FROM ${T} LIMIT ${LIM}) s`);
        r.explainRowLimit = LIM;
      }
      r.writeSites = writes.filter((w) => new RegExp(`\\b${c.table}\\b`, "i").test(w.snippet)).map((w) => `${w.file}:${w.line}`);
      results.push(r);
    }
  } finally {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    await client.end().catch(() => {});
  }

  const outDir = path.resolve(opt("out", "docs/orm-optimizer/plans"));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "payload-columns.json"), JSON.stringify({ database: target.database, checkedAt: new Date().toISOString(), results }, null, 2));
  const esc = (s) => String(s).replace(/\|/g, "\\|");
  const md = [
    `# Duplicated JSON payload check (database \`${target.database}\`, read-only)`, "",
    `Schema: \`${schemaRel}\` (${cols.length} JSON/JSONB columns, ${cols.filter((c) => c.payloadStyle).length} payload-style). Sizes are bytes from \`pg_column_size\` on ${MIN_ROWS}+ row tables; overlap is by key name only. Row contents are never printed or saved.`, "",
    "| table.column | verdict | rows | avg / max col bytes | avg rest-of-row | payload % of row | heap / TOAST / total MB | typed-column overlap | EXPLAIN read payload vs baseline (ms, shared read; first N rows, N in json) | reason |", "|---|---|---|---|---|---|---|---|---|---|",
    ...results.filter((r) => r.verdict !== "Not applicable").map((r) => r.rows == null ? `| ${r.table}.${r.column} | ${r.verdict} | - | - | - | - | - | - | - | ${esc(r.reason)} |`
      : `| ${r.table}.${r.column} | ${r.verdict} | ${r.rows} | ${r.avgColBytes} / ${r.maxColBytes} | ${r.avgRestBytes} | ${r.payloadShareOfRow}% | ${r.heapMB} / ${r.toastMB} / ${r.totalMB} | ${r.keysWithTypedColumn}/${r.keysChecked} keys, ${r.duplicatedByteShare}% of bytes | ${r.explainPayload && !r.explainPayload.error ? `${r.explainPayload.ms} vs ${r.explainBaseline.ms} ms, ${r.explainPayload.read} vs ${r.explainBaseline.read}` : "n/a"} | ${esc(r.reason)} |`),
    "", `${results.filter((r) => r.verdict === "Not applicable").length} small array/scalar JSON columns (days, *_programs, reasons, ...) were checked and set aside as not payloads.`, "", "Dup keys (examples) and payload-only keys per column are in `payload-columns.json`.",
    "", "_Reading the column is what EXPLAIN shows; each insert or update must also write those same bytes (heap/TOAST plus WAL). The write cost is therefore estimated from the average column bytes, not timed._", "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "payload-columns.md"), md);
  process.stdout.write(md);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli().catch((e) => { console.error(e.message); process.exit(4); });
