// ADDITIVE ONLY: adds a `version` column to school_drafts. Nothing is dropped, rewritten or truncated.
//
// BEFORE RUNNING: take a database backup (for example: pg_dump -Fc -t school_drafts insighted_esf7 > school_drafts.dump).
// Run it BEFORE deploying the new draft routes. The routes also work while the column is absent,
// but the lost-update protection only works once it exists.
const { pool } = require("../db/index.js");

async function run() {
  try {
    await pool.query(
      "ALTER TABLE school_drafts ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0",
    );
    const r = await pool.query("SELECT count(*) AS n FROM school_drafts");
    console.log(
      `[Migration] school_drafts.version ready (${r.rows[0].n} existing drafts, all at version 0).`,
    );
  } catch (err) {
    console.error("[Migration] failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
