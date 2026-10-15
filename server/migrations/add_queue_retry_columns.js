require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
// ADDITIVE ONLY: adds retry bookkeeping to esf7_submission_queue (attempts, next_attempt_at). Nothing is dropped,
// rewritten or truncated. Not run automatically.
//
// BEFORE RUNNING: take a database backup (for example: pg_dump -Fc -t esf7_submission_queue <db> > queue.dump).
// The worker also runs without these columns (a failed job is then marked 'failed' at once, as before).
//
// Up:   node server/migrations/add_queue_retry_columns.js
// Down: node server/migrations/add_queue_retry_columns.js --down   (drops only the two columns this script added)
const { pool } = require("../db/index.js");

async function run() {
  const down = process.argv.includes("--down");
  try {
    if (down) {
      await pool.query(
        "ALTER TABLE esf7_submission_queue DROP COLUMN IF EXISTS next_attempt_at, DROP COLUMN IF EXISTS attempts",
      );
      console.log("[Migration] esf7_submission_queue retry columns removed.");
    } else {
      await pool.query(
        `ALTER TABLE esf7_submission_queue
           ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
           ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ`,
      );
      console.log(
        "[Migration] esf7_submission_queue.attempts / next_attempt_at ready.",
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
