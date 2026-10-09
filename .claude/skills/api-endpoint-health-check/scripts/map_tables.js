#!/usr/bin/env node
"use strict";
// Static handler -> table read/write mapping. Writes tablesRead / tablesWritten / tableMappingConfidence into the manifest.
// Read-only: reads source files; the only database access is a guarded SELECT on information_schema to validate table names.
// Usage: node map_tables.js [--root <dir>] [--config <file>] [--out <dir>] [--no-db] [--db-name <name>]
const {
  fs,
  path,
  parseArgs,
  findRoot,
  loadConfig,
  outDir,
  readEnvKeys,
  assertAllowedDb,
  assertLoopbackHost,
  assertSelectOnly,
} = require("./lib");
const js = require("./jsscan");

const args = parseArgs();
const root = findRoot(args);
const cfg = loadConfig(args, root);
const dbCfg = cfg.database || {};
const dir = outDir(cfg, args);
const manifestFile = path.join(dir, "endpoints.manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const rel = (f) => path.relative(root, f).replace(/\\/g, "/");
const MAX_DEPTH = 6;
const driverFiles = new Set(
  (dbCfg.queryWrapperFiles || []).map((f) => path.resolve(root, f)),
); // DB driver wrappers are not followed

// ------------------------------------------------------------ schema (table names are always checked, never guessed)
async function loadSchema() {
  const tables = new Set();
  let source = null;
  const note = [];
  if (dbCfg.enabled !== false && !args["no-db"]) {
    try {
      const env = {
        ...readEnvKeys(path.resolve(root, dbCfg.envFile || ".env"), [
          "DB_HOST",
          "DB_PORT",
          "DB_USER",
          "DB_PASSWORD",
          "DB_NAME",
        ]),
        ...Object.fromEntries(
          Object.entries(process.env).filter(([k]) => k.startsWith("DB_")),
        ),
      };
      const name = args["db-name"] || env.DB_NAME;
      assertAllowedDb(name, cfg);
      assertLoopbackHost(env.DB_HOST || "localhost");
      const sql =
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'";
      assertSelectOnly(sql);
      const pg = require(
        require.resolve("pg", { paths: [path.join(root, "server"), root] }),
      );
      const client = new pg.Client({
        host: env.DB_HOST || "localhost",
        port: Number(env.DB_PORT || 5432),
        user: env.DB_USER || "postgres",
        password: env.DB_PASSWORD,
        database: name,
      });
      await client.connect();
      await client.query("SET default_transaction_read_only = on");
      (await client.query(sql)).rows.forEach((r) =>
        tables.add(r.table_name.toLowerCase()),
      );
      await client.end();
      source = `database ${name} (information_schema)`;
    } catch (e) {
      if (/^SAFETY/.test(e.message)) throw e;
      note.push(
        `database schema unavailable (${e.message}); fell back to static CREATE TABLE scan`,
      );
    }
  }
  if (!tables.size) {
    for (const g of dbCfg.staticSchemaGlobs || []) {
      const base = path.resolve(root, path.dirname(g));
      const pat = new RegExp(
        "^" +
          path
            .basename(g)
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*") +
          "$",
      );
      let files = [];
      try {
        files = fs
          .readdirSync(base)
          .filter((f) => pat.test(f))
          .map((f) => path.join(base, f));
      } catch (e) {
        /* none */
      }
      for (const f of files)
        for (const m of (js.readFile(f) || "").matchAll(
          /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
        ))
          tables.add(m[1].toLowerCase());
    }
    source =
      "static CREATE TABLE scan (database not used; names are less certain)";
  }
  return { tables, source, note };
}

// ------------------------------------------------------------ SQL extraction
const SQLISH =
  /\b(select|insert\s+into|update|delete\s+from|with)\b[\s\S]*?\b(from|into|set|join|values)\b/i;
function literalsIn(body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" || c === '"' || c === "`") {
      const j = js.skipLiteral(body, i);
      out.push({ text: body.slice(i + 1, j - 1), index: i, quote: c });
      i = j - 1;
    } else if (c === "/" && (body[i + 1] === "/" || body[i + 1] === "*"))
      i = js.skipLiteral(body, i) - 1;
  }
  return out;
}

function extractFromSql(raw) {
  const result = {
    read: new Set(),
    written: new Set(),
    dynamic: [],
    jsonb: [],
  };
  const hasDynamicTable = /\b(from|join|into|update)\s+\$\{/i.test(raw);
  if (hasDynamicTable)
    result.dynamic.push("table name built from a variable (${...}) in SQL");
  let sql = raw
    .replace(/\$\{[^}]*\}/g, " $X ")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ");
  const ctes = new Set(
    [
      ...sql.matchAll(
        /(?:\bwith\s+(?:recursive\s+)?|,\s*)([a-z_][a-z0-9_]*)\s+as\s*(?:not\s+materialized\s*|materialized\s*)?\(/gi,
      ),
    ].map((m) => m[1].toLowerCase()),
  );
  const take = (re, set) => {
    sql = sql.replace(re, (all, name) => {
      const n = name
        .replace(/"/g, "")
        .replace(/^public\./i, "")
        .toLowerCase();
      if (!ctes.has(n)) set.add(n);
      return " ";
    });
  };
  take(/\binsert\s+into\s+((?:public\.)?"?[a-z_][\w]*"?)/gi, result.written);
  take(
    /\bdelete\s+from\s+(?:only\s+)?((?:public\.)?"?[a-z_][\w]*"?)/gi,
    result.written,
  );
  take(
    /\bupdate\s+(?:only\s+)?((?:public\.)?"?[a-z_][\w]*"?)\s+(?:as\s+)?(?:[a-z_]\w*\s+)?set\b/gi,
    result.written,
  );
  take(
    /\btruncate\s+(?:table\s+)?((?:public\.)?"?[a-z_][\w]*"?)/gi,
    result.written,
  );
  take(
    /\b(?:from|join)\s+(?:only\s+)?((?:public\.)?"?[a-z_][\w]*"?)(?!\s*\()/gi,
    result.read,
  );
  for (const m of raw.matchAll(
    /insert\s+into\s+(?:public\.)?"?([a-z_]\w*)"?\s*\(([^)]*)\)/gi,
  )) {
    for (const col of m[2].split(",").map((c) => c.trim().toLowerCase()))
      if (/^(payload|data|json\w*|body|draft\w*)$/.test(col))
        result.jsonb.push(`${m[1].toLowerCase()}.${col}`);
  }
  for (const m of raw.matchAll(
    /update\s+(?:public\.)?"?([a-z_]\w*)"?\s+set\s+(payload|data)\s*=/gi,
  ))
    result.jsonb.push(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  return result;
}

// ------------------------------------------------------------ analysis of one handler (follows calls through files)
const fnCache = new Map();
const fns = (f) => {
  if (!fnCache.has(f)) fnCache.set(f, js.functionsOf(f));
  return fnCache.get(f);
};
const impCache = new Map();
const imps = (f) => {
  if (!impCache.has(f)) impCache.set(f, js.importsOf(f));
  return impCache.get(f);
};
const CALL_SKIP = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "function",
  "return",
  "require",
  "async",
  "await",
  "typeof",
  "new",
  "Boolean",
  "String",
  "Number",
  "parseInt",
  "parseFloat",
  "Array",
  "Object",
  "Promise",
  "Date",
  "Math",
  "JSON",
  "Set",
  "Map",
  "Error",
  "Symbol",
  "setTimeout",
]);

function analyzeFunction(file, fn, depth, visited, acc, ctxLabel) {
  const key = `${file}::${fn.start}`;
  if (visited.has(key)) return;
  visited.add(key);
  const body = fn.body;
  const startLine = fn.line;
  for (const lit of literalsIn(body)) {
    if (!SQLISH.test(lit.text)) continue;
    const r = extractFromSql(lit.text);
    const line = startLine + body.slice(0, lit.index).split("\n").length - 1;
    r.read.forEach((t) => acc.read.set(t, `${rel(file)}:${line}`));
    r.written.forEach((t) => acc.written.set(t, `${rel(file)}:${line}`));
    r.dynamic.forEach((d) =>
      acc.dynamic.push({ reason: d, at: `${rel(file)}:${line}` }),
    );
    r.jsonb.forEach((j) => acc.jsonb.add(j));
    acc.sqlFound = true;
  }
  if (driverFiles.has(file)) return;
  // db access whose SQL is not a literal in this function
  for (const m of body.matchAll(/\.query\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) {
    if (
      !new RegExp(
        `(?:const|let|var)\\s+${m[1].replace(/\$/g, "\\$")}\\s*=`,
      ).test(body)
    )
      acc.opaque.push({
        reason: `query(${m[1]}) where ${m[1]} is not defined in the same function`,
        at: `${rel(file)}:${startLine + body.slice(0, m.index).split("\n").length - 1}`,
      });
  }
  const imports = imps(file);
  const local = fns(file);
  const seenCalls = new Set();
  for (const m of body.matchAll(
    /(?<![\w$.])(?:([A-Za-z_$][\w$]*)\.)?([A-Za-z_$][\w$]*)\s*\(/g,
  )) {
    const obj = m[1];
    const name = m[2];
    if (CALL_SKIP.has(name) || seenCalls.has(`${obj}.${name}`)) continue;
    seenCalls.add(`${obj}.${name}`);
    let target = null;
    if (!obj && local.has(name) && local.get(name).start !== fn.start)
      target = { file, fn: local.get(name) };
    else if (!obj && imports.has(name)) {
      const imp = imports.get(name);
      if (imp.file) {
        const f2 = fns(imp.file).get(imp.exportName || name);
        if (f2) target = { file: imp.file, fn: f2 };
        else
          acc.unresolvedCalls.push({
            call: name,
            from: rel(file),
            why: `defined in ${rel(imp.file)} but no function "${imp.exportName || name}" found statically`,
          });
      }
    } else if (obj && imports.has(obj)) {
      const imp = imports.get(obj);
      if (imp.file) {
        const f2 = fns(imp.file).get(name);
        if (f2) target = { file: imp.file, fn: f2 };
      }
    }
    if (target && !driverFiles.has(target.file)) {
      if (depth >= MAX_DEPTH) acc.depthLimited = true;
      else
        analyzeFunction(
          target.file,
          target.fn,
          depth + 1,
          visited,
          acc,
          ctxLabel,
        );
    }
  }
}

function newAcc() {
  return {
    read: new Map(),
    written: new Map(),
    dynamic: [],
    opaque: [],
    unresolvedCalls: [],
    jsonb: new Set(),
    sqlFound: false,
    depthLimited: false,
  };
}

async function main() {
  const schema = await loadSchema();
  const knownPrefix = dbCfg.tablePrefix || "";
  const intentional = new Set(
    (dbCfg.intentionalSpellings || []).map((s) => s.toLowerCase()),
  );
  const extra = new Set((dbCfg.extraTables || []).map((s) => s.toLowerCase()));
  const cache = new Map();
  const unknownGlobal = new Map();
  for (const ep of manifest.endpoints) {
    const hfile = path.resolve(root, ep.handler.file);
    const cacheKey = `${ep.handler.file}:${ep.handler.line}:${ep.handler.name}`;
    let acc = cache.get(cacheKey);
    if (!acc) {
      acc = newAcc();
      const local = fns(hfile);
      let fn =
        ep.handler.name !== "inline"
          ? local.get(ep.handler.name.split(".").pop())
          : null;
      if (!fn) {
        // inline handler: take the call that starts at the declaration line
        const src = js.readFile(hfile) || "";
        const lineStart =
          src
            .split("\n")
            .slice(0, ep.handler.line - 1)
            .join("\n").length + (ep.handler.line > 1 ? 1 : 0);
        const open = src.indexOf("(", lineStart);
        const parsed = open >= 0 ? js.splitArgs(src, open) : null;
        const last = parsed && parsed.args[parsed.args.length - 1];
        if (last)
          fn = {
            start: last.start,
            line: js.lineOf(src, last.start),
            body: last.text,
            file: hfile,
          };
      }
      if (fn) analyzeFunction(hfile, fn, 0, new Set(), acc, ep.id);
      else
        acc.opaque.push({
          reason: "handler body could not be located statically",
          at: `${ep.handler.file}:${ep.handler.line}`,
        });
      cache.set(cacheKey, acc);
    }
    const notes = [];
    const classify = (map) => {
      const ok = [];
      const unknown = [];
      for (const [t, at] of map) {
        if (schema.tables.has(t) || extra.has(t)) ok.push(t);
        else if (
          (knownPrefix && t.startsWith(knownPrefix)) ||
          /^school_/.test(t)
        )
          unknown.push({ table: t, at });
        // other bare identifiers (aliases, CTE-like names, functions) are ignored on purpose
      }
      return { ok: [...new Set(ok)].sort(), unknown };
    };
    const r = classify(acc.read);
    const w = classify(acc.written);
    for (const u of [...r.unknown, ...w.unknown]) {
      notes.push(
        `table "${u.table}" referenced at ${u.at} is not in the schema`,
      );
      unknownGlobal.set(u.table, u.at);
    }
    if (intentional.size)
      notes.push(
        ...[...new Set([...r.ok, ...w.ok])]
          .filter((t) => intentional.has(t))
          .map((t) => `${t}: intentional spelling, not a typo`),
      );
    let confidence = "resolved";
    if (acc.dynamic.length) {
      confidence = "unresolved";
      acc.dynamic.forEach((d) =>
        notes.push(`unresolved: ${d.reason} at ${d.at}`),
      );
    } else if (
      acc.opaque.length ||
      acc.unresolvedCalls.length ||
      acc.depthLimited
    ) {
      confidence = acc.sqlFound ? "partial" : "unresolved";
      acc.opaque.forEach((d) => notes.push(`${d.reason} at ${d.at}`));
      acc.unresolvedCalls.forEach((d) =>
        notes.push(`call ${d.call} (${d.from}): ${d.why}`),
      );
      if (acc.depthLimited)
        notes.push(
          `call chain deeper than ${MAX_DEPTH} levels was not followed`,
        );
    }
    if (!acc.sqlFound && confidence === "resolved")
      notes.push("no SQL found in the handler or the functions it calls");
    ep.tablesRead = r.ok;
    ep.tablesWritten = w.ok;
    ep.tablesUnknown = [
      ...new Set([...r.unknown, ...w.unknown].map((u) => u.table)),
    ];
    ep.jsonbPayloadWrites = [...acc.jsonb].sort();
    ep.tableMappingConfidence = confidence;
    ep.tableMappingNotes = notes;
    if (ep.effect === "read" && ep.tablesWritten.length)
      ep.tableMappingNotes.push("READ-style method writes to tables");
  }
  manifest.meta.tableMapping = {
    ranAt: new Date().toISOString(),
    schemaSource: schema.source,
    schemaTables: schema.tables.size,
    notes: schema.note,
    confidence: manifest.endpoints.reduce((a, e) => {
      a[e.tableMappingConfidence] = (a[e.tableMappingConfidence] || 0) + 1;
      return a;
    }, {}),
    tablesNotInSchema: [...unknownGlobal].map(([table, at]) => ({ table, at })),
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  const c = manifest.meta.tableMapping.confidence;
  console.log(
    `Table mapping: ${JSON.stringify(c)} (schema: ${schema.source}, ${schema.tables.size} tables).`,
  );
  if (manifest.meta.tableMapping.tablesNotInSchema.length)
    console.log(
      `Tables referenced in code but missing from the schema: ${manifest.meta.tableMapping.tablesNotInSchema.map((t) => t.table).join(", ")}`,
    );
  console.log(`Manifest updated: ${manifestFile}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
