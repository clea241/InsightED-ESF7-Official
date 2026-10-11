#!/usr/bin/env node
// Static inventory of database operations, pool setup, transaction-pooling blockers,
// Redis usage and PM2 settings. Read-only: no network, no DB connection, writes only to the OS temp dir.
// Usage: node inventory-db-operations.mjs [--root <path>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const ri = argv.indexOf("--root");
const ROOT = path.resolve(ri >= 0 ? argv[ri + 1] : process.cwd());
if (!fs.existsSync(ROOT)) {
  console.error(`Root not found: ${ROOT}`);
  process.exit(2);
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".claude", "out", "test-results"]);
const CODE_EXT = /\.(js|mjs|cjs|ts|tsx|jsx)$/;
const TEST_PATH = /(^|\/)(tests?|__tests__|e2e|fixtures?|load-test)\/|\.(test|spec)\.[jt]sx?$/;
const SCRIPT_PATH = /(^|\/)(scripts?|scratch|migrations?|migrate|drizzle)\/|\/(create|check|debug|inspect|diagnose|clean|add|list|find|fix|seed|scan|scratch|reseed|register|truncate|verify|test)_[^/]*$/;

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
    } else if (CODE_EXT.test(e.name) || /^ecosystem.*\.(js|cjs|mjs|json)$/.test(e.name)) {
      const full = path.join(dir, e.name);
      try {
        if (fs.statSync(full).size < 2_000_000) files.push(full);
      } catch {}
    }
  }
})(ROOT);

const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

const operations = [];
const poolSetups = [];
const blockers = [];
const redis = { libraries: new Set(), commands: [], keyPatterns: new Set(), workerGateEnv: new Set(), files: new Set() };
const pm2 = [];
const envNames = new Set();
const drivers = new Set();

const ROUTE_RE = /\b(?:router|app|server)\.(get|post|put|patch|delete|all)\s*\(\s*([`"'])([^`"']*)\2/;
const FUNC_RES = [
  /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
  /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/,
];

function enclosing(lines, i) {
  for (let k = i; k >= 0 && k > i - 400; k--) {
    const m = lines[k].match(ROUTE_RE);
    if (m) return { kind: "route", name: `${m[1].toUpperCase()} ${m[3]}` };
    for (const re of FUNC_RES) {
      const f = lines[k].match(re);
      if (f && !/^(if|for|while|switch|catch|return)$/.test(f[1])) return { kind: "function", name: f[1] };
    }
  }
  return { kind: "top-level", name: "(module)" };
}

const SQL_VERBS = [
  [/\bINSERT\s+INTO\s+([\w."]+)/i, "insert"],
  [/\bUPDATE\s+([\w."]+)\s+SET\b/i, "update"],
  [/\bDELETE\s+FROM\s+([\w."]+)/i, "delete"],
  [/\bTRUNCATE\s+(?:TABLE\s+)?([\w."]+)/i, "truncate"],
  [/\bSELECT\b[\s\S]{0,400}?\bFROM\s+([\w."]+)/i, "select"],
];
const DRIZZLE_RE = /\b(\w+)\.(select|selectDistinct|insert|update|delete|transaction|execute)\s*\(([^)]*)/;
const TX_WORDS = /\b(BEGIN|COMMIT|ROLLBACK)\b/;

for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  const r = rel(f);
  const isTest = TEST_PATH.test(r);
  const isScript = SCRIPT_PATH.test(r);
  const isFrontend = /\.(jsx|tsx)$/.test(r) || /(^|\/)client\//.test(r);
  const usesDrizzle = /drizzle-orm|drizzle\(/.test(text);
  const hasPg = /require\(["']pg["']\)|from ["']pg["']/.test(text);
  if (hasPg) drivers.add("pg");
  if (/from ["']postgres["']|require\(["']postgres["']\)/.test(text)) drivers.add("postgres");
  if (/drizzle-orm\/node-postgres/.test(text)) drivers.add("pg (via drizzle node-postgres)");
  if (/drizzle-orm\/postgres-js/.test(text)) drivers.add("postgres (via drizzle postgres-js)");
  const usesRedis = /require\(["'](ioredis|redis)["']\)|from ["'](ioredis|redis)["']/.exec(text);
  if (usesRedis) {
    redis.libraries.add(usesRedis[1] || usesRedis[2]);
    redis.files.add(r);
  }

  if (/^ecosystem.*/.test(path.basename(f))) {
    const apps = [];
    for (const m of text.matchAll(/name:\s*["']([^"']+)["']/g)) apps.push(m[1]);
    const inst = [...text.matchAll(/instances:\s*([^,\n]+)/g)].map((m) => m[1].trim());
    const mode = [...text.matchAll(/exec_mode:\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const names = new Set();
    for (const m of text.matchAll(/\b([A-Z][A-Z0-9_]*(?:DB|PG|DATABASE|REDIS|POOL|WORKER)[A-Z0-9_]*)\s*:/g)) names.add(m[1]);
    pm2.push({ file: r, apps, instances: inst, execMode: mode, dbEnvNames: [...names].sort() });
  }

  const inTxFile = new Set(); // line indexes covered by BEGIN..COMMIT in the same function (approximate)
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    const ln = i + 1;
    // ---- env var names (never values)
    for (const m of line.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (/DATABASE|DB_|PG|POSTGRES|REDIS|POOL|WORKER/.test(m[1])) envNames.add(m[1]);
      if (/WORKER/.test(m[1])) redis.workerGateEnv.add(m[1]);
    }
    // ---- operations
    if (!isTest && !isFrontend) {
      // statement window: this line through the first line ending in ";" (max 8 lines) so the next statement never bleeds in
      let end = i;
      while (end < Math.min(i + 7, lines.length - 1) && !/;\s*$/.test(lines[end])) end++;
      const win = lines.slice(i, end + 1).join(" ");
      let found = null;
      if (usesDrizzle) {
        const d = line.match(DRIZZLE_RE);
        if (d && /^(db|tx|trx|database|client|conn)$/i.test(d[1])) {
          const tbl = (lines.slice(i, i + 3).join(" ").match(/\.(?:from|into|update|insert)\s*\(\s*([A-Za-z_$][\w$.]*)/) || [])[1] || (d[3].match(/^\s*([A-Za-z_$][\w$.]*)\s*$/) || [])[1] || null;
          found = { api: "drizzle", op: d[2] === "execute" ? "raw-execute" : d[2], table: tbl };
        }
        if (/\.onConflict(DoUpdate|DoNothing)\s*\(/.test(line)) operations.push({ file: r, line: ln, api: "drizzle", op: "upsert-modifier", table: null, ...enclosing(lines, i), batch: false, context: isScript ? "script" : "app", note: "onConflict" });
        if (/\bsql`/.test(line) && !found) found = { api: "drizzle-sql", op: "raw-sql-tag", table: null };
      }
      if (!found && /\.(query|execute)\s*\(/.test(line) && !/req\.query|\.query\(\)\s*$/.test(line)) {
        for (const [re, op] of SQL_VERBS) {
          const m = win.match(re);
          if (m) {
            found = { api: "raw-sql", op, table: m[1].replace(/"/g, "") };
            break;
          }
        }
        if (!found && /\.query\s*\(\s*([`"'])\s*(BEGIN|COMMIT|ROLLBACK|SET|SHOW)/i.test(line)) found = { api: "raw-sql", op: "tx-control", table: null };
      }
      if (found) {
        const enc = enclosing(lines, i);
        const batch = /unnest\s*\(|VALUES\s*\$\{|\.values\(\s*\[?\s*\w+\.map|VALUES\s*\(.*\),\s*\(/i.test(win);
        operations.push({ file: r, line: ln, ...found, ...enc, batch, upsert: /ON\s+CONFLICT|onConflict/i.test(win), context: isScript ? "script" : enc.kind === "route" ? "route" : "app", note: "" });
      }
      if (/\.transaction\s*\(|["'`]BEGIN["'`]/.test(line) && !operations.some((o) => o.file === r && o.line === ln)) {
        operations.push({ file: r, line: ln, api: usesDrizzle ? "drizzle" : "raw-sql", op: "transaction", table: null, ...enclosing(lines, i), batch: false, upsert: false, context: isScript ? "script" : "app", note: "" });
      }
    }
    // ---- pool setup
    if (/new\s+Pool\s*\(|\bpostgres\s*\(\s*[^)]|\bdrizzle\s*\(/.test(line) && !isTest) {
      const block = lines.slice(i, i + 14).join("\n");
      const re = (k) => new RegExp(`\\b${k}\\s*:\\s*(\\d[\\d_]*)`);
      // fall back to the whole file so a spread base config (...baseConfig) is still found
      const num = (k) => (block.match(re(k)) || text.match(re(k)) || [])[1] || null;
      poolSetups.push({
        file: r, line: ln, context: isScript ? "script" : "app",
        kind: /new\s+Pool/.test(line) ? "pg.Pool" : /postgres\s*\(/.test(line) ? "postgres()" : "drizzle()",
        max: num("max"), idleTimeoutMillis: num("idleTimeoutMillis"), connectionTimeoutMillis: num("connectionTimeoutMillis"),
        prepare: (block.match(/\bprepare\s*:\s*(true|false)/) || [])[1] || null,
        connectionEnvNames: [...new Set([...block.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]).filter((n) => /URL|DB|PG/.test(n)))],
      });
    }
    // ---- transaction-pooling blockers
    const add = (id, severity, detail) => !isTest && !isFrontend && blockers.push({ id, severity, file: r, line: ln, detail, ...enclosing(lines, i), context: isScript ? "script" : "app" });
    if (/pg_(try_)?advisory_lock(_shared)?\s*\(/.test(line)) add("session-advisory-lock", "incompatible", "Session-level advisory lock; needs a direct connection (or switch to pg_advisory_xact_lock inside one transaction).");
    else if (/pg_(try_)?advisory_xact_lock/.test(line)) add("xact-advisory-lock", "compatible", "Transaction-scoped advisory lock; works under transaction pooling if used inside one transaction.");
    if (/["'`]\s*(LISTEN|UNLISTEN)\s+\w+/i.test(line) || /\bNOTIFY\s+\w+|pg_notify\s*\(/i.test(line)) add("listen-notify", "incompatible", "LISTEN/NOTIFY needs a long-lived session connection that bypasses transaction pooling.");
    if (/["'`]\s*SET\s+(?!LOCAL\b)(SESSION\s+)?[\w.]+\s*(=|TO\b)/i.test(line)) add("session-set", "incompatible", "Session-level SET leaks or is lost under transaction pooling; use SET LOCAL inside a transaction.");
    else if (/["'`]\s*SET\s+LOCAL\b/i.test(line) || /set_config\s*\([^)]*,\s*(true)\s*\)/i.test(line)) add("set-local", "check", "SET LOCAL / set_config(...,true) is safe only inside an explicit transaction; confirm BEGIN..COMMIT wraps it on the same client.");
    if (/\bCREATE\s+(GLOBAL\s+|LOCAL\s+)?TEMP(ORARY)?\s+TABLE/i.test(line)) add("temp-table", "incompatible", "Temporary tables are session state; unsafe under transaction pooling unless ON COMMIT DROP inside one transaction.");
    if (/\bWITH\s+HOLD\b/i.test(line)) add("cursor-with-hold", "incompatible", "DECLARE ... CURSOR WITH HOLD outlives a transaction; needs session pooling.");
    if (/\bname\s*:\s*["'`][^"'`]+["'`]\s*,/.test(line) && /\btext\s*:|\bvalues\s*:/.test(lines.slice(i, i + 3).join(" "))) add("named-prepared-statement", "check", "Named query = protocol-level prepared statement; needs PgBouncer max_prepared_statements support (verify version) or unnamed queries.");
    if (/\bprepare\s*:\s*true\b/.test(line)) add("driver-prepare-true", "check", "Driver prepared statements enabled; set prepare:false unless PgBouncer supports them.");
    if (/\bFOR\s+UPDATE\b/i.test(line)) add("select-for-update", "check", "Row locks last until commit; confirm lock and write share one transaction on one client (never across requests).");
    if (/\.connect\s*\(\s*\)/.test(line) && hasPg) add("pooled-client-checkout", "info", "Checked-out client; confirm it is released in finally and that BEGIN/COMMIT run on this same client.");

    // ---- redis
    if (redis.files.has(r)) {
      const c = line.match(/\.(xadd|xreadgroup|xack|xgroup|xautoclaim|xclaim|xtrim|xlen|xpending|keys|scan|setex|expire|ttl|del|hset|lpush|brpop|publish|subscribe)\s*\(/i);
      if (c) redis.commands.push({ file: r, line: ln, command: c[1].toLowerCase() });
      if (/\.set\s*\([^)]*["'`]EX["'`]/i.test(line)) redis.commands.push({ file: r, line: ln, command: "set EX (ttl)" });
      if (/\.(get|set|del|xadd)\s*\(/.test(line)) for (const k of line.matchAll(/["'`]([A-Za-z][\w-]*:[\w:${}.\-]*)["'`]/g)) redis.keyPatterns.add(k[1]);
      for (const k of line.matchAll(/(STREAM_KEY|GROUP_NAME|QUEUE_KEY)\s*=\s*(?:process\.env\.\w+\s*\|\|\s*)?["'`]([^"'`]+)["'`]/g)) redis.keyPatterns.add(`${k[1]}=${k[2]}`);
    }
  });
}

// ---- summaries
const count = (arr, fn) => arr.reduce((m, x) => ((m[fn(x)] = (m[fn(x)] || 0) + 1), m), {});
const appOps = operations.filter((o) => o.context !== "script");
const cmdSet = new Set(redis.commands.map((c) => c.command));
const inventory = {
  meta: { repo: path.basename(ROOT), filesScanned: files.length, generatedBy: "inventory-db-operations.mjs", note: "Candidates from static scan; confirm each by opening the file." },
  pool: { drivers: [...drivers].sort(), setups: poolSetups, envVarNames: [...envNames].sort() },
  operations,
  transactionPoolingFlags: blockers,
  redis: {
    libraries: [...redis.libraries], files: [...redis.files].sort(),
    commands: redis.commands, keyPatterns: [...redis.keyPatterns].sort().slice(0, 60),
    usesStreams: ["xadd", "xreadgroup", "xack"].every((c) => cmdSet.has(c)),
    usesKeysCommand: cmdSet.has("keys"), usesScan: cmdSet.has("scan"),
    usesTtl: cmdSet.has("set EX (ttl)") || cmdSet.has("setex") || cmdSet.has("expire"),
    workerGateEnvNames: [...redis.workerGateEnv].sort(),
    workerInWebProcessPossible: redis.commands.some((c) => c.command === "xreadgroup") && redis.workerGateEnv.size === 0
      ? "yes (no worker gate env var found)" : redis.commands.some((c) => c.command === "xreadgroup") ? "gated by env var (verify default) " : "n/a",
  },
  pm2,
  counts: {
    operations: operations.length, appOperations: appOps.length,
    byOp: count(appOps, (o) => o.op), byApi: count(operations, (o) => o.api),
    byContext: count(operations, (o) => o.context),
    blockersBySeverity: count(blockers, (b) => b.severity),
  },
};

const tmp = path.join(os.tmpdir(), `pgbouncer-redis-plan-${path.basename(ROOT)}`);
fs.mkdirSync(tmp, { recursive: true });
const outFile = path.join(tmp, "inventory.json");
fs.writeFileSync(outFile, JSON.stringify(inventory, null, 2));

// ---- human summary
const out = [];
out.push(`Inventory for ${inventory.meta.repo}  (${files.length} files scanned)`);
out.push(`JSON: ${outFile}\n`);
out.push(`Drivers: ${inventory.pool.drivers.join(", ") || "none found"}`);
out.push("Pool setups:");
if (!poolSetups.length) out.push("  (none found)");
const appPools = poolSetups.filter((p) => p.context === "app");
out.push(`  (${poolSetups.length - appPools.length} more pools in one-off scripts/scratch files; see inventory.json)`);
for (const p of appPools) out.push(`  ${p.file}:${p.line}  ${p.kind}  max=${p.max ?? "default(10 for pg)"}  idle=${p.idleTimeoutMillis ?? "-"}  connTimeout=${p.connectionTimeoutMillis ?? "-"}  prepare=${p.prepare ?? "-"}  env=[${p.connectionEnvNames.join(",")}]`);
out.push(`\nDB operations: ${operations.length} total, ${appOps.length} in app code (excl. scripts/tests)`);
out.push(`  by op:  ${JSON.stringify(inventory.counts.byOp)}`);
out.push(`  by api: ${JSON.stringify(inventory.counts.byApi)}`);
const perFile = Object.entries(count(appOps, (o) => o.file)).sort((a, b) => b[1] - a[1]).slice(0, 10);
out.push("  busiest files: " + perFile.map(([f, n]) => `${f} (${n})`).join(", "));
out.push(`\nTransaction-pooling flags: ${JSON.stringify(inventory.counts.blockersBySeverity)}`);
for (const b of blockers.filter((x) => x.severity !== "info").slice(0, 40)) out.push(`  [${b.severity}] ${b.id}  ${b.file}:${b.line}  in ${b.name}${b.context === "script" ? " (script)" : ""}`);
if (blockers.filter((x) => x.severity !== "info").length > 40) out.push("  ... see inventory.json for the rest");
out.push(`\nRedis: libs=[${inventory.redis.libraries.join(",")}] streams=${inventory.redis.usesStreams} KEYS=${inventory.redis.usesKeysCommand} SCAN=${inventory.redis.usesScan} ttl=${inventory.redis.usesTtl}`);
out.push(`  files: ${inventory.redis.files.join(", ") || "none"}`);
out.push(`  worker in web process: ${inventory.redis.workerInWebProcessPossible}; gate env: [${inventory.redis.workerGateEnvNames.join(",")}]`);
out.push("\nPM2:");
if (!pm2.length) out.push("  (no ecosystem file found)");
for (const p of pm2) out.push(`  ${p.file}  apps=[${p.apps.join(",")}] instances=[${p.instances.join(",")}] exec_mode=[${p.execMode.join(",")}] env names=[${p.dbEnvNames.join(",")}]`);
console.log(out.join("\n"));
