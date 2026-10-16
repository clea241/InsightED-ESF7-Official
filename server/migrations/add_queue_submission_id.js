require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
// ADDITIVE ONLY: adds a nullable submission_id (UUID) to esf7_submission_queue and a unique index on
// (school_id, submission_id). Rows without a submission_id (NULL) never conflict, so existing rows and clients that
// do not send one are unaffected. Nothing is dropped, rewritten or truncated. Not run automatically.
//
// BEFORE RUNNING: take a database backup (for example: pg_dump -Fc -t esf7_submission_queue <db> > queue.dump).
// Creating the index briefly blocks writes to the queue table; run it outside a deadline window.
// The submit routes work without this migration (they ignore submissionId until the column exists).
//
// Up:   node server/migrations/add_queue_submission_id.js
// Down: node server/migrations/add_queue_submission_id.js --down   (drops only the index and column added here)
const { pool } = require("../db/index.js");

async function run() {
  const down = process.argv.includes("--down");
  try {
    if (down) {
      await pool.query(
        "DROP INDEX IF EXISTS uq_esf7_submission_queue_school_submission",
      );
      await pool.query(
        "ALTER TABLE esf7_submission_queue DROP COLUMN IF EXISTS submission_id",
      );
      console.log("[Migration] esf7_submission_queue.submission_id removed.");
    } else {
      await pool.query(
        "ALTER TABLE esf7_submission_queue ADD COLUMN IF NOT EXISTS submission_id UUID",
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_esf7_submission_queue_school_submission
           ON esf7_submission_queue (school_id, submission_id)`,
      );
      console.log(
        "[Migration] esf7_submission_queue.submission_id and its unique index are ready.",
      );
    }
  } catch (err) {
    console.error("[Migration] failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
