// Shared helpers for the backend integration tests.
//
// SAFETY: these tests CREATE and DROP tables. They only run against a database whose name contains "test"
// (a disposable database such as the CI service container or `createdb esf7_test`), and they never read
// server/.env credentials. Point them at it with TEST_DATABASE_URL (and optionally TEST_REDIS_URL).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const nodeRequire = createRequire(import.meta.url);

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || "";
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL || "";

export function assertDisposableDatabase(url) {
  let name = "";
  try {
    name = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL");
  }
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run: database name "${name}" does not contain "test". Integration tests drop and recreate tables.`,
    );
  }
  if (/stride-posgre-prod|azure\.com/i.test(url)) {
    throw new Error("Refusing to run against the production host.");
  }
}

// Every connection-string variable server/db reads. Several take priority over DATABASE_URL, so all of them are
// pointed at the test database, and the production-named ones are removed.
const DB_URL_VARS = [
  "DATABASE_URL",
  "PRIMARY_DATABASE_URL",
  "STAGING_DATABASE_URL",
  "AUTH_DATABASE_URL",
  "USERS_DATABASE_URL",
  "INSIGHTED_DATABASE_URL",
];
const PROD_URL_VARS = ["PROD_DATABASE_URL", "PRODUCTION_DATABASE_URL"];

function assertNoForeignDatabaseTargets() {
  const bad = [
    ...DB_URL_VARS.filter((n) => process.env[n] !== TEST_DATABASE_URL),
    ...PROD_URL_VARS.filter((n) => process.env[n]),
  ];
  if (bad.length) {
    throw new Error(
      `Refusing to run: ${bad.join(", ")} would point tests at a non-test database.`,
    );
  }
}

// Must run before anything requires server/db/index.js, so its pools point at the test database
// (dotenv never overrides variables that are already set).
export function pointServerAtTestDatabase() {
  assertDisposableDatabase(TEST_DATABASE_URL);
  const u = new URL(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  // server/db/index.js prefers these over DATABASE_URL; a developer's root .env may set them to a real database.
  for (const name of DB_URL_VARS) process.env[name] = TEST_DATABASE_URL;
  for (const name of PROD_URL_VARS) delete process.env[name];
  assertNoForeignDatabaseTargets();
  process.env.DB_HOST = u.hostname;
  process.env.DB_PORT = u.port || "5432";
  process.env.DB_NAME = u.pathname.replace(/^\//, "");
  process.env.DB_USER = decodeURIComponent(u.username);
  process.env.DB_PASSWORD = decodeURIComponent(u.password);
  process.env.DB_SSL = "false";
  if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
}

// Same shapes as server/ensure_school_drafts_table.js and server/create_esf7_submission_queue_table.js.
export const SCHEMA_SQL = `
  DROP TABLE IF EXISTS school_drafts;
  DROP TABLE IF EXISTS esf7_submission_queue;
  CREATE TABLE school_drafts (
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (school_id, school_year)
  );
  CREATE TABLE esf7_submission_queue (
    id SERIAL PRIMARY KEY,
    school_id TEXT NOT NULL,
    school_year TEXT NOT NULL DEFAULT '2026-2027',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    signature TEXT,
    certified_by TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'CANCELLED')),
    error_message TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_esf7_submission_queue_status_id ON esf7_submission_queue (status, id ASC);
  CREATE INDEX idx_esf7_submission_queue_school_sy ON esf7_submission_queue (school_id, school_year);
`;

// Builds the app's normalized esf7_* tables on a disposable database: schema.sql, plus what separate migration scripts
// add on top of it (esf7_class_sections is created by create_esf7_class_sections_table.js, so a minimal stand-in is
// enough for the foreign keys; payload_extras.js `expand` adds the `extras` column to each codec table).
export async function applyAppSchema(pool) {
  const all = readFileSync(
    fileURLToPath(new URL("../../schema.sql", import.meta.url)),
    "utf8",
  );
  await pool.query(
    "DROP TABLE IF EXISTS esf7_shs_workload_rows, esf7_workload_rows, esf7_personnel_employment, esf7_personnel_profile CASCADE",
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS esf7_class_sections (id VARCHAR(50) PRIMARY KEY)",
  );
  await pool.query(all);
  const { TABLES } = nodeRequire("../../utils/payloadExtras.js");
  for (const t of Object.keys(TABLES)) {
    await pool.query(
      `ALTER TABLE IF EXISTS ${t} ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb`,
    );
  }
}
