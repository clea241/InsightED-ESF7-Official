// Shared helpers for the backend integration tests.
//
// SAFETY: these tests CREATE and DROP tables. They only run against a database whose name contains "test"
// (a disposable database such as the CI service container or `createdb esf7_test`), and they never read
// server/.env credentials. Point them at it with TEST_DATABASE_URL (and optionally TEST_REDIS_URL).
import { createRequire } from "node:module";

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

// Must run before anything requires server/db/index.js, so its pools point at the test database
// (dotenv never overrides variables that are already set).
export function pointServerAtTestDatabase() {
  assertDisposableDatabase(TEST_DATABASE_URL);
  const u = new URL(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
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
