#!/usr/bin/env node
"use strict";
// Refuses to continue unless the load-test target is a local, disposable environment with synthetic data.
// Reads .env.load only (plus .env/.env.production/.env.staging for an equality comparison; values are never printed).
// Usage: node guard-load-env.js [--root <repo>] [--env-file <path>]
const fs = require("fs");
const os = require("os");
const path = require("path");
const dns = require("dns").promises;
const { execFileSync } = require("child_process");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const root = path.resolve(opt("root", process.cwd()));
const envFile = path.resolve(root, opt("env-file", ".env.load"));

function parseEnv(file) {
  const out = {};
  let t = "";
  try {
    t = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  for (const l of t.split(/\r?\n/)) {
    const m = l.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (m && !l.trim().startsWith("#"))
      out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const results = [];
const pass = (m) => results.push([true, m]);
const fail = (m) => results.push([false, m]);
const isLoopbackAddr = (a) =>
  a === "::1" || /^127\./.test(a) || a === "::ffff:127.0.0.1";
const LOCAL_NAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

async function checkLocalHost(label, host, prodHosts) {
  const h = String(host || "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  if (!h) {
    fail(`${label}: no host`);
    return false;
  }
  if (prodHosts.includes(h)) {
    fail(`${label}: host is listed in PRODUCTION_HOSTS`);
    return false;
  }
  if (!LOCAL_NAMES.has(h) && !LOCAL_NAMES.has("[" + h + "]")) {
    fail(`${label}: host is not localhost/127.0.0.1/::1`);
    return false;
  }
  try {
    const addrs = await dns.lookup(h, { all: true });
    if (!addrs.length || !addrs.every((a) => isLoopbackAddr(a.address))) {
      fail(`${label}: host resolves to a non-loopback address`);
      return false;
    }
  } catch {
    fail(`${label}: host does not resolve`);
    return false;
  }
  pass(`${label} is loopback`);
  return true;
}

function sameAsProd(env, loadKey, prodKeys, prodEnvs) {
  const v = env[loadKey];
  if (!v) return false;
  return prodEnvs.some((pe) => prodKeys.some((k) => pe[k] && pe[k] === v));
}

(async () => {
  const env = parseEnv(envFile);
  if (!env) {
    fail(`.env.load not found (copy .env.load.example to .env.load)`);
    return finish();
  }
  const prodHosts = String(env.PRODUCTION_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Target app
  let base;
  try {
    base = new URL(env.LOAD_BASE_URL);
  } catch {
    base = null;
  }
  if (!base) fail("LOAD_BASE_URL is missing or not a URL");
  else await checkLocalHost("target", base.hostname, prodHosts);

  // Database
  let db;
  try {
    db = new URL(env.LOAD_DATABASE_URL);
  } catch {
    db = null;
  }
  if (!db) fail("LOAD_DATABASE_URL is missing or not a URL");
  else {
    const dbName = decodeURIComponent(
      db.pathname.replace(/^\//, ""),
    ).toLowerCase();
    const hostOk = await checkLocalHost("database", db.hostname, prodHosts);
    if (/^drill_/.test(dbName))
      fail(
        "database name looks like a restored backup (drill_*): real personal data must never be load-tested",
      );
    else if (!dbName.includes("test"))
      fail('database name must contain "test"');
    else if (hostOk)
      pass("database name looks like a disposable test database");
  }

  // Redis (optional)
  if (env.LOAD_REDIS_URL) {
    let r;
    try {
      r = new URL(env.LOAD_REDIS_URL);
    } catch {
      r = null;
    }
    if (!r) fail("LOAD_REDIS_URL is not a URL");
    else await checkLocalHost("redis", r.hostname, prodHosts);
  } else pass("no Redis configured (optional)");

  // JWT secret for the load environment
  if (!env.LOAD_JWT_SECRET || env.LOAD_JWT_SECRET.length < 16)
    fail("LOAD_JWT_SECRET missing or shorter than 16 characters");
  else pass("LOAD_JWT_SECRET is set (value not shown)");

  // Equality against production-like env files (compare only, never print)
  const prodEnvs = [];
  for (const dir of [root, path.join(root, "server")])
    for (const f of [".env", ".env.production", ".env.staging"]) {
      const e = parseEnv(path.join(dir, f));
      if (e) prodEnvs.push(e);
    }
  const dupes = [];
  if (
    sameAsProd(
      env,
      "LOAD_DATABASE_URL",
      ["DATABASE_URL", "DB_URL", "POSTGRES_URL"],
      prodEnvs,
    )
  )
    dupes.push("LOAD_DATABASE_URL");
  if (sameAsProd(env, "LOAD_REDIS_URL", ["REDIS_URL"], prodEnvs))
    dupes.push("LOAD_REDIS_URL");
  if (sameAsProd(env, "LOAD_JWT_SECRET", ["JWT_SECRET"], prodEnvs))
    dupes.push("LOAD_JWT_SECRET");
  if (db) {
    const dbn = decodeURIComponent(db.pathname.replace(/^\//, ""));
    if (
      prodEnvs.some(
        (pe) =>
          pe.DB_NAME &&
          pe.DB_NAME === dbn &&
          (!pe.DB_HOST || LOCAL_NAMES.has(pe.DB_HOST) === false),
      )
    )
      dupes.push(
        "LOAD_DATABASE_URL (database name equals a non-local DB_NAME)",
      );
  }
  if (dupes.length)
    fail(
      `value(s) equal the .env/.env.production/.env.staging values: ${dupes.join(", ")}`,
    );
  else pass("no load value equals a production/staging value");

  // Tooling
  try {
    const v = execFileSync("k6", ["version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    pass(`k6 installed (${v.split("\n")[0]})`);
  } catch {
    fail(
      'k6 is not installed. Install: macOS "brew install k6"; Windows "winget install k6"; Linux see https://grafana.com/docs/k6/latest/set-up/install-k6/',
    );
  }

  // Machine specs and free capacity
  const cpus = os.cpus();
  const sample = () =>
    cpus.length
      ? os
          .cpus()
          .map((c) => ({
            idle: c.times.idle,
            total: Object.values(c.times).reduce((a, b) => a + b, 0),
          }))
      : [];
  const a = sample();
  await new Promise((r) => setTimeout(r, 500));
  const b = sample();
  const idle = a.length
    ? (b.reduce((s, c, i) => s + (c.idle - a[i].idle), 0) /
        Math.max(
          1,
          b.reduce((s, c, i) => s + (c.total - a[i].total), 0),
        )) *
      100
    : 0;
  const specs = {
    platform: `${os.platform()} ${os.release()}`,
    cpu_model: cpus[0] ? cpus[0].model.trim() : "unknown",
    cpu_cores: cpus.length,
    memory_total_gb: +(os.totalmem() / 1073741824).toFixed(1),
    memory_free_gb: +(os.freemem() / 1073741824).toFixed(1),
    cpu_idle_percent: +idle.toFixed(0),
    node: process.version,
  };
  console.log(
    `INFO machine: ${specs.cpu_cores} cores (${specs.cpu_model}), ${specs.memory_total_gb} GB RAM (${specs.memory_free_gb} GB free), CPU idle ${specs.cpu_idle_percent}%, ${specs.platform}`,
  );
  if (specs.cpu_idle_percent < 30)
    fail(
      `machine is busy (CPU idle ${specs.cpu_idle_percent}%): close other programs, results would measure the laptop`,
    );
  else pass("machine has free CPU");
  if (specs.memory_free_gb < 1) fail("less than 1 GB free memory");
  else pass("machine has free memory");
  try {
    const rawDir = path.join(root, "load-test", "reports", "raw");
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(
      path.join(rawDir, "machine.json"),
      JSON.stringify(specs, null, 2),
    );
  } catch {
    /* best effort */
  }
  finish();
})();

function finish() {
  let ok = true;
  for (const [p, m] of results) {
    console.log(`${p ? "PASS" : "FAIL"} ${m}`);
    if (!p) ok = false;
  }
  if (!ok)
    console.log(
      "\nGuard failed: no load was generated. Fix .env.load (do not edit this guard).",
    );
  process.exit(ok ? 0 : 1);
}
