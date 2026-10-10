#!/usr/bin/env node
"use strict";
// Refuses any scan unless the target is allowed. No override flag exists. Never prints secret values.
// Usage: node guard-scan-target.js --target local|staging [--confirm-host <host>] [--root <repo>]
const fs = require("fs");
const path = require("path");
const net = require("net");
const dns = require("dns").promises;

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const root = path.resolve(opt("root", process.cwd()));
const target = opt("target", "");
const confirmHost = opt("confirm-host", "");

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
const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "";
  }
};
const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);
const isPrivateIp = (ip) =>
  /^10\./.test(ip) ||
  /^192\.168\./.test(ip) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  /^127\./.test(ip) ||
  ip === "::1" ||
  /^f[cd]/i.test(ip);

async function resolveAll(h) {
  if (net.isIP(h)) return [h];
  try {
    return (await dns.lookup(h, { all: true })).map((a) => a.address);
  } catch {
    return null;
  }
}

async function main() {
  if (target !== "local" && target !== "staging") {
    fail("--target must be local or staging (production is never allowed)");
    return;
  }
  const env = parseEnv(path.join(root, ".env.security"));
  if (!env) {
    fail(".env.security not found (copy .env.security.example)");
    return;
  }
  pass(".env.security loaded");
  const prod = (env.PRODUCTION_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (prod.length === 0)
    fail("PRODUCTION_HOSTS is empty; list every production hostname");
  else pass(`PRODUCTION_HOSTS has ${prod.length} entries`);

  const url = target === "local" ? env.LOCAL_APP_URL : env.STAGING_APP_URL;
  const host = hostOf(url);
  if (!host) {
    fail(`${target === "local" ? "LOCAL_APP_URL" : "STAGING_APP_URL"} missing or not a URL`);
    return;
  }
  if (prod.includes(host)) {
    fail("host is listed in PRODUCTION_HOSTS");
    return;
  }
  pass("host is not listed in PRODUCTION_HOSTS");

  if (target === "local") {
    if (LOCAL.has(host)) pass("target host is local");
    else {
      fail("host is not localhost, 127.0.0.1 or ::1");
      return;
    }
    const ips = await resolveAll(host);
    if (ips && ips.every((a) => a === "::1" || /^127\./.test(a)))
      pass("host resolves to loopback only");
    else fail("host does not resolve to loopback only");
    const testEnv = parseEnv(path.join(root, ".env.test"));
    const dbUrl =
      (testEnv && (testEnv.DATABASE_URL || testEnv.TEST_DATABASE_URL)) ||
      env.LOCAL_DATABASE_URL;
    if (!dbUrl) {
      fail("no local database URL (.env.test or LOCAL_DATABASE_URL); cannot confirm a test database");
      return;
    }
    let u;
    try {
      u = new URL(dbUrl);
    } catch {
      fail("database URL is not parseable");
      return;
    }
    const dbHost = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const dbName = u.pathname.replace(/^\//, "").toLowerCase();
    if (LOCAL.has(dbHost) && !prod.includes(dbHost)) pass("database host is local");
    else fail("database host is not local or is listed in PRODUCTION_HOSTS");
    if (dbName.includes("test")) pass("database name contains 'test'");
    else fail("database name does not contain 'test'");
    return;
  }
  // staging
  if (!confirmHost) {
    fail("--confirm-host is required for staging");
    return;
  }
  if (confirmHost === host) pass("--confirm-host equals the host in STAGING_APP_URL");
  else {
    fail("--confirm-host does not exactly equal the host in STAGING_APP_URL");
    return;
  }
  const ips = await resolveAll(host);
  if (!ips || ips.length === 0) {
    fail("staging host does not resolve");
    return;
  }
  pass("staging host resolves");
  const prodIps = new Set();
  for (const p of prod) for (const a of (await resolveAll(p)) || []) prodIps.add(a);
  if (ips.some((a) => prodIps.has(a)))
    fail("staging host resolves to the same IP as a production host");
  else pass("staging IP differs from every production IP");
  if (net.isIP(host) && !isPrivateIp(host))
    fail("host is a public IP address (could be a third party)");
  else pass("host is a name or a private IP");
}

main()
  .catch(() => fail("unexpected guard error"))
  .finally(() => {
    for (const [ok, m] of results) console.log(`${ok ? "PASS" : "FAIL"} ${m}`);
    const bad = results.some(([ok]) => !ok) || results.length === 0;
    console.log(bad ? "GUARD: REFUSED" : "GUARD: OK");
    process.exit(bad ? 1 : 0);
  });
