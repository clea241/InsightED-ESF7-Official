#!/usr/bin/env node
"use strict";
// Refuses to continue unless the failure-path test target is a local, disposable environment.
// Reads .env.test only. .env, .env.production and .env.staging (root and server/) are read ONLY to compare values for equality.
// Secrets are never printed: output is variable names and PASS/FAIL only.
// Usage: node guard-test-env.js [--root <repo>] [--env-file <path>]
const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const root = path.resolve(opt("root", process.cwd()));
const envFile = path.resolve(root, opt("env-file", ".env.test"));

function parseEnv(file) {
  let t;
  try {
    t = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const out = {};
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
const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);
const bare = (h) =>
  String(h || "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
const isLoopbackAddr = (a) =>
  a === "::1" || /^127\./.test(a) || a === "::ffff:127.0.0.1";

async function checkLocalHost(label, host) {
  const h = bare(host);
  if (!h) return (fail(`${label}: no host`), false);
  if (!LOCAL.has(h))
    return (fail(`${label} host must be localhost, 127.0.0.1 or ::1`), false);
  try {
    const addrs = await dns.lookup(h, { all: true });
    if (!addrs.length || !addrs.every((a) => isLoopbackAddr(a.address)))
      return (fail(`${label} host resolves to a non-loopback address`), false);
  } catch {
    return (fail(`${label} host does not resolve`), false);
  }
  pass(`${label} host is local`);
  return true;
}

const parseUrl = (v) => {
  try {
    return new URL(v);
  } catch {
    return null;
  }
};

(async () => {
  const env = parseEnv(envFile);
  if (!env) {
    fail(`.env.test not found (copy .env.test.example to .env.test)`);
    return finish();
  }

  // NODE_ENV
  if (String(env.NODE_ENV || "").toLowerCase() === "production")
    fail("NODE_ENV must not be production");
  else pass("NODE_ENV is not production");

  // App URLs (backend and frontend)
  for (const k of ["APP_URL", "FRONTEND_URL"]) {
    const u = parseUrl(env[k]);
    if (!u) fail(`${k} is missing or not a URL`);
    else if (!["localhost", "127.0.0.1"].includes(bare(u.hostname)))
      fail(`${k} host must be localhost or 127.0.0.1`);
    else await checkLocalHost(k, u.hostname);
  }

  // Database
  const dbVars = [
    "DATABASE_URL",
    "PRIMARY_DATABASE_URL",
    "USERS_DATABASE_URL",
    "INSIGHTED_DATABASE_URL",
  ];
  const dbUrls = dbVars.filter((k) => env[k]).map((k) => [k, parseUrl(env[k])]);
  if (!env.DATABASE_URL) fail("DATABASE_URL is missing");
  for (const [k, u] of dbUrls) {
    if (!u) {
      fail(`${k} is not a URL`);
      continue;
    }
    const name = decodeURIComponent(
      u.pathname.replace(/^\//, ""),
    ).toLowerCase();
    const hostOk = await checkLocalHost(`db (${k})`, u.hostname);
    if (!name.includes("test")) fail(`db name (${k}) must contain "test"`);
    else if (/^drill_/.test(name))
      fail(`db name (${k}) looks like a restored backup (drill_*)`);
    else if (hostOk) pass(`db name (${k}) contains "test"`);
  }
  if (env.DB_HOST) await checkLocalHost("DB_HOST", env.DB_HOST);
  if (env.DB_NAME) {
    if (!env.DB_NAME.toLowerCase().includes("test"))
      fail('DB_NAME must contain "test"');
    else pass('DB_NAME contains "test"');
  }

  // Redis (optional)
  if (env.REDIS_URL) {
    const r = parseUrl(env.REDIS_URL);
    if (!r) fail("REDIS_URL is not a URL");
    else await checkLocalHost("REDIS_URL", r.hostname);
  } else pass("REDIS_URL not set (optional)");
  if (env.REDIS_HOST) await checkLocalHost("REDIS_HOST", env.REDIS_HOST);

  // JWT secret
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16)
    fail("JWT_SECRET missing or shorter than 16 characters");
  else pass("JWT_SECRET is set (value not shown)");

  // Equality against production-like env files. Only equality is computed; values are never printed.
  const others = [];
  for (const dir of [root, path.join(root, "server")])
    for (const f of [".env", ".env.production", ".env.staging"]) {
      const e = parseEnv(path.join(dir, f));
      if (e) others.push(e);
    }
  const urlKeys = [
    "DATABASE_URL",
    "PRIMARY_DATABASE_URL",
    "USERS_DATABASE_URL",
    "INSIGHTED_DATABASE_URL",
    "STAGING_DATABASE_URL",
    "PROD_DATABASE_URL",
    "PRODUCTION_DATABASE_URL",
    "DB_URL",
    "POSTGRES_URL",
  ];
  const dupes = [];
  const testUrls = dbVars.map((k) => env[k]).filter(Boolean);
  if (others.some((o) => urlKeys.some((k) => o[k] && testUrls.includes(o[k]))))
    dupes.push("DATABASE_URL");
  const testDbName =
    env.DATABASE_URL && parseUrl(env.DATABASE_URL)
      ? decodeURIComponent(parseUrl(env.DATABASE_URL).pathname.slice(1))
      : null;
  if (testDbName && others.some((o) => o.DB_NAME && o.DB_NAME === testDbName))
    dupes.push(
      "database name equals DB_NAME in .env/.env.production/.env.staging",
    );
  if (
    env.REDIS_URL &&
    others.some((o) => o.REDIS_URL && o.REDIS_URL === env.REDIS_URL)
  )
    dupes.push("REDIS_URL");
  if (
    env.JWT_SECRET &&
    others.some((o) => o.JWT_SECRET && o.JWT_SECRET === env.JWT_SECRET)
  )
    dupes.push("JWT_SECRET");
  if (dupes.length)
    fail(
      `value(s) equal the .env/.env.production/.env.staging values: ${dupes.join(", ")}`,
    );
  else
    pass("no .env.test value equals a .env/.env.production/.env.staging value");

  finish();
})();

function finish() {
  let ok = true;
  for (const [good, msg] of results) {
    console.log(`${good ? "PASS" : "FAIL"} ${msg}`);
    if (!good) ok = false;
  }
  console.log(
    ok
      ? "GUARD OK: environment is local and disposable."
      : "GUARD FAILED: not running any test. Do not work around this.",
  );
  process.exit(ok ? 0 : 1);
}
