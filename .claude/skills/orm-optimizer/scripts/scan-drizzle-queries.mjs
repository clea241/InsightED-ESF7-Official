#!/usr/bin/env node
// Static scan for candidate Drizzle (and raw pg) query problems. Heuristic: every hit is a CANDIDATE, not a conclusion.
// Usage: node scan-drizzle-queries.mjs [repoPath] [--glob "<pattern>"] [--schema <path/to/schema.ts>] [--out docs/orm-optimizer/plans]
// stdout: JSON array of { file, line, pattern, snippet, ... }.  Also writes candidates.md and candidates.json (used by index-coverage.mjs).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { payloadSchemaColumns, payloadWriteSites } from "./payload-columns.mjs";

const SRC = /\.(ts|tsx|js|mjs|cjs)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", ".next", ".git", ".claude", ".agents", ".agent", "docs", "drizzle", "migrations", "__tests__", "tests", "test", "e2e", "spec", "specs", "load-test", "__mocks__", "uploads", "backups"]);
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^test_)|(\.d\.ts$)/;
// ---- DEFAULT EXCLUDE LIST for one-off code (tier "script"). Hits there are counted but not listed unless --include-scripts is passed.
// Folders: any scripts/ scratch*/ seed*/ backfill*/ migrat*/ tools/ directory. Files: operational one-offs by name prefix.
const SCRIPT_DIR_DEFAULTS = /(^|\/)(scripts?|scratch\w*|seed\w*|backfill\w*|migrat\w*|tools?)\//i;
const SCRIPT_FILE_DEFAULTS = /^(check|seed|reseed|migrate|migration|backfill|create|debug|inspect|list|verify|reset|patch|clean|fix|add|drop|truncate|recreate|match|scan|register|diagnose|find|insert|scratch|show|backup|restore)[_-]/i;
const ONE_OFF = SCRIPT_DIR_DEFAULTS;
const ONE_OFF_FILE = SCRIPT_FILE_DEFAULTS;

// ---------------------------------------------------------------- schema parsing (exported for index-coverage.mjs)
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
  const out = []; let d = 0, q = null, start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if ("([{".includes(c)) d++;
    else if (")]}".includes(c)) d--;
    else if (c === "," && d === 0) { out.push(t.slice(start, i)); start = i + 1; }
  }
  if (t.slice(start).trim()) out.push(t.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

export function parseSchema(text) {
  const tables = {};
  const re = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(text, open);
    if (close < 0) continue;
    const args = splitTop(text.slice(open + 1, close));
    const nameM = args[0] && args[0].match(/^["'`]([^"'`]+)["'`]$/);
    if (!nameM) continue;
    const lineOf = (i) => text.slice(0, i).split("\n").length;
    const t = { name: nameM[1], line: lineOf(m.index), columns: {}, jsonColumns: {}, indexes: [], fks: [] };
    if (args[1] && args[1].startsWith("{")) {
      for (const entry of splitTop(args[1].slice(1, -1))) {
        const em = entry.match(/^(\w+)\s*:\s*([\s\S]*)$/);
        if (!em) continue;
        const dbName = (em[2].match(/^\w+\(\s*["'`]([^"'`]+)["'`]/) || [])[1] || em[1];
        t.columns[em[1]] = dbName;
        const jm = em[2].match(/^(jsonb?)\s*\(/);
        if (jm) t.jsonColumns[em[1]] = { dbName, type: jm[1], line: lineOf(Math.max(open, text.indexOf(entry, open))), notNull: /\.notNull\s*\(/.test(em[2]) };
        if (/\.primaryKey\s*\(/.test(em[2])) t.indexes.push({ name: `${t.name}_pkey`, columns: [em[1]], kind: "primary" });
        else if (/\.unique\s*\(/.test(em[2])) t.indexes.push({ name: `${t.name}_${dbName}_unique`, columns: [em[1]], kind: "unique" });
      }
    }
    if (args[2]) {
      const body = args[2];
      const arrow = body.indexOf("=>");
      let rest = arrow >= 0 ? body.slice(arrow + 2).trim() : body;
      if (rest.startsWith("(") && rest.endsWith(")")) rest = rest.slice(1, -1).trim();
      if (rest.startsWith("[") || rest.startsWith("{")) {
        for (let el of splitTop(rest.slice(1, -1))) {
          el = el.replace(/^\w+\s*:\s*/, "");
          const cols = [...el.matchAll(/\b\w+\.(\w+)\b/g)].map((x) => x[1]).filter((c) => t.columns[c]);
          const kind = (el.match(/^(index|uniqueIndex|unique|primaryKey|foreignKey)\s*\(/) || [])[1];
          if (!kind) continue;
          if (kind === "foreignKey") {
            const cm = el.match(/columns\s*:\s*\[([^\]]*)\]/);
            if (cm) t.fks.push({ columns: [...cm[1].matchAll(/\.(\w+)/g)].map((x) => x[1]) });
            continue;
          }
          const idxName = (el.match(/^\w+\(\s*(?:\{[^}]*?name\s*:\s*)?["'`]([^"'`]+)["'`]/) || [])[1] || `${t.name}_${kind}_${cols.join("_")}`;
          t.indexes.push({ name: idxName, columns: cols, kind: kind === "primaryKey" ? "primary" : kind.startsWith("unique") ? "unique" : "index", expression: /\bsql\s*`/.test(el) });
        }
      }
    }
    tables[m[1]] = t;
  }
  return tables;
}

export function findSchemaFile(root) {
  const hits = [];
  (function walk(d, depth) {
    if (depth > 6) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (["node_modules", ".git", "dist", "build", ".next", ".claude", ".agents", ".agent", "tests", "coverage"].includes(e.name)) continue;
        walk(path.join(d, e.name), depth + 1);
      } else if (/^schema\.ts$/.test(e.name)) hits.push(path.join(d, e.name));
    }
  })(root, 0);
  const withTable = hits.filter((f) => /pgTable\s*\(/.test(fs.readFileSync(f, "utf8")));
  return withTable[0] || null;
}

// ---------------------------------------------------------------- source cleaning: blank comments and string contents, keep line structure
function cleanLines(src) {
  const out = []; let cur = ""; let st = "n"; let q = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === "\n") { out.push(cur); cur = ""; if (st === "lc" || st === "s") st = "n"; continue; }
    if (st === "lc") continue;
    if (st === "bc") { if (c === "*" && n === "/") { st = "n"; i++; } continue; }
    if (st === "s" || st === "t") {
      if (c === "\\" && n !== "\n") { i++; continue; }
      if ((st === "s" && c === q) || (st === "t" && c === "`")) { st = "n"; cur += c; }
      continue;
    }
    if (c === "/" && n === "/") { st = "lc"; i++; continue; }
    if (c === "/" && n === "*") { st = "bc"; i++; continue; }
    if (c === '"' || c === "'") { st = "s"; q = c; cur += c; continue; }
    if (c === "`") { st = "t"; cur += c; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const LOOP_RE = /\b(?:for|while)\s*(?:await\s*)?\(|\.(?:map|forEach|flatMap|reduce)\s*\(/g;
const DRIZZLE_RE = /\b(?:db|tx|trx|database|drizzleDb|\w*Db|\w*DB)\s*\.\s*(select|selectDistinct|insert|update|delete|execute)\s*\(/g;
const REL_RE = /\.query\.\w+\.(findMany|findFirst)\s*\(/g;
const RAW_RE = /(?:\b(?:\w*[pP]ool|\w*[cC]lient|conn(?:ection)?|\w*[dD][bB]|pg|\w*[tT]x|trx)|\w+\(\))\s*\.query\s*\(/g;
const POOL_RE = /\bnew\s+(?:pg\.)?Pool\s*\(|\bpostgres\s*\(/g;

function siteStarts(line) {
  const sites = [];
  for (const [re, kind] of [[DRIZZLE_RE, "drizzle"], [REL_RE, "relational"], [RAW_RE, "raw"], [POOL_RE, "pool"]]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) sites.push({ idx: m.index, kind, method: m[1] || (kind === "raw" ? "query" : "new"), parenIdx: m.index + m[0].length - 1 });
  }
  return sites;
}

function statementEnd(cl, i, col) {
  let depth = 0, seen = false;
  for (let j = i; j < Math.min(cl.length, i + 60); j++) {
    const line = j === i ? cl[j].slice(col) : cl[j];
    for (const c of line) {
      if ("([{".includes(c)) { depth++; seen = true; } else if (")]}".includes(c)) depth--;
    }
    if (seen && depth <= 0) {
      let k = j + 1;
      while (k < cl.length && !cl[k].trim()) k++;
      if (k < cl.length && /^\s*\??\./.test(cl[k])) continue;
      return j;
    }
  }
  return Math.min(cl.length - 1, i + 60);
}

function maxWithDepth(cleanStmt) {
  const stack = []; let best = 0;
  for (let i = 0; i < cleanStmt.length; i++) {
    const c = cleanStmt[i];
    if (c === "{") {
      const isWith = /\bwith\s*:\s*$/.test(cleanStmt.slice(Math.max(0, i - 30), i));
      stack.push(isWith);
      best = Math.max(best, stack.filter(Boolean).length);
    } else if (c === "}") stack.pop();
  }
  return best;
}

// ---------------------------------------------------------------- scan one file
function scanFile(rel, src, schema, byDbName, poolerHint, out, usage) {
  const rl = src.split(/\r?\n/);
  const cl = cleanLines(src);
  const oneOff = ONE_OFF.test(rel) || ONE_OFF_FILE.test(path.basename(rel));
  const seen = new Set();
  const add = (line, pattern, snippet, note, source) => {
    const key = `${line}|${pattern}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ file: rel, line, pattern, snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 140), note: note || "", source, access_layer: source === "drizzle" ? "drizzle" : "raw-pg", tier: oneOff ? "script" : "app", oneOff, group: `${pattern}:${rel}` });
  };

  let brace = 0, paren = 0;
  const loops = [];
  for (let i = 0; i < cl.length; i++) {
    const line = cl[i];
    const sites = siteStarts(line);
    const loopOpen = new Map();
    LOOP_RE.lastIndex = 0;
    let lm;
    while ((lm = LOOP_RE.exec(line))) loopOpen.set(lm.index + lm[0].length - 1, lm[0][0] === "." ? "cb" : "for");
    const siteByStart = new Map(sites.map((s) => [s.idx, s]));

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const s = siteByStart.get(c);
      if (s) handleSite(s, i, c, loops.length > 0);
      if (ch === "(") {
        if (loopOpen.has(c)) loops.push({ kind: loopOpen.get(c), b: brace, p: paren, entered: false });
        paren++;
      } else if (ch === ")") paren--;
      else if (ch === "{") brace++;
      else if (ch === "}") brace--;
      for (let k = loops.length - 1; k >= 0; k--) {
        const L = loops[k];
        if (L.kind === "cb") { if (paren <= L.p && ch === ")") loops.splice(k, 1); }
        else {
          if (brace > L.b) L.entered = true;
          if ((L.entered && brace <= L.b) || (!L.entered && ch === ";" && paren <= L.p)) loops.splice(k, 1);
        }
      }
    }
  }

  function handleSite(s, i, col, inLoop) {
    const endLine = statementEnd(cl, i, col);
    const stmtClean = [cl[i].slice(col), ...cl.slice(i + 1, endLine + 1)].join("\n");
    const stmtRaw = [rl[i].slice(col), ...rl.slice(i + 1, endLine + 1)].join("\n");
    const lineNo = i + 1;
    const snip = rl[i].trim();

    if (s.kind === "pool") {
      if (!/\bmax\s*:/.test(stmtClean)) add(lineNo, "pool-no-max", snip, "no explicit pool size (max) in this call" + (/\.\.\./.test(stmtClean) ? "; config is spread in, max may be set elsewhere" : ""), "pool");
      if (poolerHint && /\bpostgres\s*\(/.test(stmtClean) && !/prepare\s*:\s*false/.test(stmtClean)) add(lineNo, "prepared-with-pooler", snip, "pooler hint found in repo but prepare:false not set", "pool");
      return;
    }
    const isDrizzle = s.kind === "drizzle" || s.kind === "relational";
    const rawText = stmtRaw;
    const sqlHead = (rawText.match(/\(\s*[`'"]\s*(\w+)/) || [])[1] || "";
    let write = ["insert", "update", "delete"].includes(s.method) || /^(insert|update|delete)$/i.test(sqlHead);
    const source = isDrizzle ? "drizzle" : "raw-pg";

    if (inLoop) add(lineNo, write ? "write-in-loop" : "query-in-loop", snip, "query call lexically inside a loop/callback (N+1 candidate)", source);

    if (s.method === "select" || s.method === "selectDistinct") {
      if (/\.select(?:Distinct)?\s*\(\s*\)/.test(stmtClean)) add(lineNo, "select-all", snip, "db.select() with no column list", source);
      const agg = /\b(count|sum|avg|max|min)\s*\(/.test(stmtClean);
      if (!/\.limit\s*\(/.test(stmtClean) && !/\.where\s*\(/.test(stmtClean) && !agg) add(lineNo, "missing-limit", snip, "select with no where and no limit (full table read)", source);
    }
    if (s.kind === "relational") {
      if (s.method === "findMany" && !/\blimit\s*:/.test(stmtClean)) add(lineNo, "missing-limit", snip, /\bwhere\s*:/.test(stmtClean) ? "findMany with where but no limit" : "findMany with no where and no limit", source);
      if (maxWithDepth(stmtClean) >= 3) add(lineNo, "deep-with", snip, `nested 'with' depth ${maxWithDepth(stmtClean)}`, source);
    }
    if (s.kind === "raw") {
      if (/^select|^with/i.test(sqlHead)) {
        if (/\bselect\s+(?:distinct\s+)?(?:\w+\.)?\*/i.test(rawText)) add(lineNo, "select-all", snip, "SELECT * in raw SQL", source);
        if (/\bfrom\b/i.test(rawText) && !/\blimit\b/i.test(rawText) && !/\bwhere\b/i.test(rawText) && !/\b(count|sum|avg|max|min)\s*\(/i.test(rawText)) add(lineNo, "missing-limit", snip, "raw SELECT with no WHERE and no LIMIT", source);
      }
      if (/^\s*\(\s*`[\s\S]*\$\{/.test(rawText) || /^\s*\(\s*['"][^'"]*['"]\s*\+/.test(rawText)) add(lineNo, "string-built-sql", snip, "SQL assembled with interpolation/concatenation instead of bound parameters (check whether only identifiers are interpolated)", source);
      if (poolerHint && /\.query\s*\(\s*\{[^}]*\bname\s*:/.test(rawText)) add(lineNo, "prepared-with-pooler", snip, "named (prepared) query while a pooler hint exists", source);
    }
    if (/\bsql\.raw\s*\(/.test(stmtClean) && /\$\{|\+/.test((stmtRaw.match(/sql\.raw\s*\([\s\S]*?\)/) || [""])[0])) add(lineNo, "string-built-sql", snip, "sql.raw() with interpolated/concatenated value", source);

    // order by on unindexed columns (Drizzle only; needs schema)
    if (isDrizzle) {
      const ob = stmtClean.indexOf(".orderBy(");
      if (ob >= 0) {
        const close = matchClose(stmtClean, ob + 8);
        const args = stmtClean.slice(ob + 9, close < 0 ? undefined : close);
        for (const [, v, col] of args.matchAll(/\b(\w+)\.(\w+)\b/g)) {
          const t = schema[v];
          if (!t || !t.columns[col]) continue;
          usage.push({ file: rel, line: lineNo, table: t.name, column: t.columns[col], kind: "orderBy" });
          const leading = t.indexes.some((ix) => ix.columns[0] === col);
          if (!leading) add(lineNo, "orderby-unindexed", snip, `ORDER BY ${t.name}.${t.columns[col]}: no index in schema.ts leads with this column`, source);
        }
      }
      for (const [, fn, v, col] of stmtClean.matchAll(/\b(eq|ne|gt|gte|lt|lte|like|ilike|inArray|notInArray|between|isNull|isNotNull)\(\s*(\w+)\.(\w+)/g)) {
        const t = schema[v];
        if (t && t.columns[col]) usage.push({ file: rel, line: lineNo, table: t.name, column: t.columns[col], kind: fn === "eq" || fn === "inArray" ? "where-eq" : "where" });
      }
      for (const jm of stmtClean.matchAll(/\.(?:inner|left|right|full)?[jJ]oin\s*\(/g)) {
        const close = matchClose(stmtClean, jm.index + jm[0].length - 1);
        const seg = stmtClean.slice(jm.index, close < 0 ? undefined : close);
        for (const [, v, col] of seg.matchAll(/\b(\w+)\.(\w+)\b/g)) {
          const t = schema[v];
          if (t && t.columns[col]) usage.push({ file: rel, line: lineNo, table: t.name, column: t.columns[col], kind: "join" });
        }
      }
    } else if (s.kind === "raw" && /^select/i.test(sqlHead)) {
      // single-table raw SELECT: attribute WHERE / ORDER BY columns to that table
      const tabs = [...rawText.matchAll(/\b(?:from|join)\s+"?(?:public"?\.)?"?(\w+)"?/gi)].map((x) => x[1].toLowerCase());
      const uniq = [...new Set(tabs)];
      if (uniq.length === 1 && byDbName[uniq[0]]) {
        const w = (rawText.match(/\bwhere\b([\s\S]*?)(?:\bgroup by\b|\border by\b|\blimit\b|$)/i) || [])[1] || "";
        for (const [, col] of w.matchAll(/(?:\w+\.)?"?(\w+)"?\s*(?:=|<>|>=|<=|<|>|\bin\b|\blike\b|\bilike\b|=\s*any)/gi)) usage.push({ file: rel, line: lineNo, table: uniq[0], column: col, kind: "where-eq" });
        const o = (rawText.match(/\border by\s+(?:\w+\.)?"?(\w+)"?/i) || [])[1];
        if (o) {
          usage.push({ file: rel, line: lineNo, table: uniq[0], column: o, kind: "orderBy" });
          const t = byDbName[uniq[0]];
          const prop = Object.keys(t.columns).find((k) => t.columns[k] === o);
          if (prop && !t.indexes.some((ix) => ix.columns[0] === prop)) add(lineNo, "orderby-unindexed", snip, `ORDER BY ${uniq[0]}.${o}: no index in schema.ts leads with this column`, source);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- main
function globToRegex(g) {
  const s = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0000").replace(/\*\*/g, "\u0001").replace(/\*/g, "[^/]*").replace(/\u0000/g, "(?:.*/)?").replace(/\u0001/g, ".*");
  return new RegExp("^" + s + "$");
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : undefined; };
  const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
  const root = path.resolve(positional[0] || ".");
  const outDir = path.resolve(opt("out") || path.join(root, "docs/orm-optimizer/plans"));
  const globRe = opt("glob") ? globToRegex(opt("glob")) : null;

  const schemaPath = opt("schema") ? path.resolve(opt("schema")) : findSchemaFile(root);
  const schema = schemaPath ? parseSchema(fs.readFileSync(schemaPath, "utf8")) : {};
  const byDbName = Object.fromEntries(Object.values(schema).map((t) => [t.name.toLowerCase(), t]));

  let poolerHint = false;
  for (const f of fs.readdirSync(root).concat(fs.existsSync(path.join(root, "server")) ? fs.readdirSync(path.join(root, "server")).map((x) => "server/" + x) : [])) {
    if (/^(\.env\.example|\.env\.sample|(server\/)?\.env\.example|docker-compose\.ya?ml|ecosystem[\w.-]*)$/.test(f) || /\.env\.example$/.test(f)) {
      try { if (/pgbouncer|:6432\b|pooler/i.test(fs.readFileSync(path.join(root, f), "utf8"))) poolerHint = true; } catch { /* ignore */ }
    }
  }

  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); }
      else if (SRC.test(e.name) && !TEST_FILE.test(e.name)) {
        const rel = path.relative(root, p).split(path.sep).join("/");
        if (!globRe || globRe.test(rel)) files.push(rel);
      }
    }
  })(root);

  const out = [], usage = [];
  for (const rel of files) {
    let src = "";
    try { src = fs.readFileSync(path.join(root, rel), "utf8"); } catch { continue; }
    if (src.length > 1.5e6) continue;
    if (!/drizzle|\.query\s*\(|\bPool\b|postgres\s*\(/.test(src)) continue;
    scanFile(rel, src, schema, byDbName, poolerHint, out, usage);
    for (const w of payloadWriteSites(rel, src, schema)) {
      const oneOff = ONE_OFF.test(rel) || ONE_OFF_FILE.test(path.basename(rel));
      const access = w.drizzle ? "drizzle" : "raw-pg";
      out.push({ file: rel, line: w.line, pattern: "payload-write-whole-body", snippet: w.snippet, note: `writes a ${w.kind} into ${w.table ? w.table + "." : ""}${w.column}`, source: access, access_layer: access, tier: oneOff ? "script" : "app", oneOff, group: `payload-write-whole-body:${rel}` });
    }
  }
  // schema-level: payload-style JSON/JSONB columns (CLI payload-columns.mjs measures them on the local DB)
  const schemaRel = schemaPath && path.relative(root, schemaPath).split(path.sep).join("/");
  for (const c of payloadSchemaColumns(schema).filter((x) => x.payloadStyle)) {
    out.push({ file: schemaRel, line: c.line, pattern: "duplicated-json-payload", snippet: `${c.table}.${c.column} (${c.type})`, note: "payload-style JSON column; check whether it re-stores fields that already have typed columns", source: "drizzle", access_layer: "drizzle", tier: "app", oneOff: false, group: `duplicated-json-payload:${c.table}` });
  }
  const includeScripts = argv.includes("--include-scripts");
  const scriptFiles = new Set(out.filter((c) => c.tier === "script").map((c) => c.file));
  const scriptHits = out.filter((c) => c.tier === "script").length;
  const excluded = includeScripts ? [] : out.filter((c) => c.tier === "script");
  const excludedByDir = {};
  for (const c of excluded) {
    const k = /^server\/[^/]+$/.test(c.file) || !c.file.includes("/") ? "(top-level script files)" : c.file.split("/").slice(0, -1).join("/");
    excludedByDir[k] = (excludedByDir[k] || 0) + 1;
  }
  if (!includeScripts) {
    for (let i = out.length - 1; i >= 0; i--) if (out[i].tier === "script") out.splice(i, 1);
    for (let i = usage.length - 1; i >= 0; i--) if (scriptFiles.has(usage[i].file)) usage.splice(i, 1);
  }
  out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "candidates.json"), JSON.stringify({ scannedAt: new Date().toISOString(), root, schemaPath: schemaPath && path.relative(root, schemaPath).split(path.sep).join("/"), poolerHint, filesScanned: files.length, includeScripts, excludedScriptHits: excluded.length, excludedScriptHitsByDir: excludedByDir, candidates: out, columnUsage: usage }, null, 2));
  const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/`/g, "'");
  const groups = new Map();
  for (const c of out) groups.set(c.group, (groups.get(c.group) || 0) + 1);
  const md = [
    "# Candidate query sites (static, unverified)",
    "",
    `Scanned ${files.length} files under \`${path.basename(root)}\`; schema: \`${schemaPath ? path.relative(root, schemaPath).split(path.sep).join("/") : "not found"}\` (${Object.keys(schema).length} tables parsed). Pooler hint in repo: ${poolerHint ? "yes" : "no"}.`,
    "Every row is a **candidate**, not a conclusion. Nothing here is proven slow until EXPLAIN ANALYZE says so. `tier`: app = request-path code, script = one-off code.",
    includeScripts ? "Scripts included (--include-scripts)." : `One-off scripts excluded by default: **${excluded.length} hits not listed** (rerun with \`--include-scripts\` to list them). By location: ${Object.entries(excludedByDir).map(([k, n]) => `${k} (${n})`).join(", ") || "none"}.`,
    "",
    `## Grouped by pattern and file (${groups.size} groups, ${out.length} sites)`,
    "",
    "| Group | Sites |", "|---|---|",
    ...[...groups].sort((a, b) => b[1] - a[1]).map(([g, n]) => `| ${esc(g)} | ${n} |`),
    "",
    "## All sites",
    "",
    "| # | file:line | pattern | access_layer | tier | note | snippet |", "|---|---|---|---|---|---|---|",
    ...out.map((c, i) => `| ${i + 1} | ${esc(c.file)}:${c.line} | ${c.pattern} | ${c.access_layer} | ${c.tier} | ${esc(c.note)} | \`${esc(c.snippet)}\` |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "candidates.md"), md);
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  console.error(`scanned ${files.length} files, ${out.length} candidate sites listed (${scriptHits} one-off script hits ${includeScripts ? "included" : "excluded; use --include-scripts"}), ${Object.keys(schema).length} schema tables -> ${path.relative(process.cwd(), outDir) || "."}/candidates.{md,json}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
