#!/usr/bin/env node
// Refuses to continue unless the target database is clearly local AND a test/local database.
// CLI:    node guard-local-db.mjs [ENV_VAR_NAME]     (default DATABASE_URL)
// Module: import { assertLocalDb } from "./guard-local-db.mjs"   -> returns { url, host, database, port }
// There is deliberately no override flag. Credentials are never printed.
import { pathToFileURL } from "node:url";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertLocalDb(envName = "DATABASE_URL") {
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} is not set. Set it to a local test database URL (host localhost/127.0.0.1/::1, database name containing "test" or "local").`);

  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${envName} is not a parseable URL (value not shown).`);
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error(`${envName} must be a postgres:// or postgresql:// URL.`);

  const strip = (h) => h.replace(/^\[|\]$/g, "").toLowerCase();
  const host = strip(u.hostname);
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Host "${host || "(empty)"}" is not local. Allowed hosts: localhost, 127.0.0.1, ::1.`);
  }
  // A ?host= / ?hostaddr= query parameter can silently override the URL host in libpq-style drivers.
  for (const key of ["host", "hostaddr"]) {
    const v = u.searchParams.get(key);
    if (v !== null && !LOCAL_HOSTS.has(strip(v))) throw new Error(`Query parameter ${key}="${v}" points at a non-local host.`);
  }

  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!database) throw new Error("The URL has no database name.");
  if (!/test|local/i.test(database)) {
    throw new Error(`Database "${database}" does not look like a test/local database (its name must contain "test" or "local").`);
  }
  return { url: raw, host, database, port: u.port || "5432" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envName = process.argv[2] || "DATABASE_URL";
  try {
    const r = assertLocalDb(envName);
    console.log(`OK local test database: host=${r.host} port=${r.port} database=${r.database}`);
  } catch (e) {
    console.error(`GUARD FAILED: ${e.message}`);
    console.error("Stopping. No query was run. Do not point this skill at a non-local database.");
    process.exit(1);
  }
}
