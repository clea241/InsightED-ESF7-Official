// The SQL statements that decide who may process a submission job. They live here (not inline in
// queue_worker.js) so the integration tests exercise exactly the SQL that production runs.
//
// Retry bookkeeping (attempts / next_attempt_at) needs server/migrations/add_queue_retry_columns.js. Until that
// migration has run, every function below behaves as it did before the columns existed.

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 5000;
const DEFAULT_RETRY_MAX_MS = 300000;

function positiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** QUEUE_CONSUMER_ENABLED=true turns the queue consumer on. Anything else (including unset) leaves it off. */
function isConsumerEnabled() {
  return (
    String(process.env.QUEUE_CONSUMER_ENABLED || "").toLowerCase() === "true"
  );
}

const maxAttempts = () =>
  positiveInt(process.env.QUEUE_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS);

// Whether the retry columns exist. Cached briefly so a job does not pay for a catalog query every time.
let retryColumnsCache = { value: null, checkedAt: 0 };
function resetRetryColumnsCache() {
  retryColumnsCache = { value: null, checkedAt: 0 };
}
async function hasRetryColumns(client) {
  if (
    retryColumnsCache.value !== null &&
    Date.now() - retryColumnsCache.checkedAt < 60000
  ) {
    return retryColumnsCache.value;
  }
  const res = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'esf7_submission_queue'
        AND column_name IN ('attempts', 'next_attempt_at')`,
  );
  retryColumnsCache = { value: res.rows[0].n === 2, checkedAt: Date.now() };
  return retryColumnsCache.value;
}

/**
 * Atomically claim a job: only one caller can move it to 'processing'.
 * Returns false when another worker already holds it, it is already completed, or it is waiting out a retry delay.
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }} client
 * @param {number} jobId
 */
async function claimJob(client, jobId) {
  const waiting = (await hasRetryColumns(client))
    ? " AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())"
    : "";
  const res = await client.query(
    `UPDATE esf7_submission_queue
        SET status = 'processing', updated_at = NOW()
      WHERE id = $1 AND status <> 'processing' AND status <> 'completed'${waiting}
      RETURNING id`,
    [jobId],
  );
  return res.rows.length > 0;
}

/**
 * Jobs whose worker died mid-run stay 'processing'. After a minute they go back to 'pending' so they are retried.
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }} client
 */
async function recoverStaleJobs(client) {
  await client.query(
    `UPDATE esf7_submission_queue
        SET status = 'pending', updated_at = NOW()
      WHERE status = 'processing'
        AND updated_at < NOW() - INTERVAL '1 minute'`,
  );
}

/**
 * Pick the oldest pending job, skipping rows other workers have locked. This only PICKS: outside a transaction the
 * row lock is released at once, so production code uses claimNextPendingJob instead.
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }} client
 * @returns {Promise<number | null>}
 */
async function pickNextPendingJob(client) {
  const waiting = (await hasRetryColumns(client))
    ? " AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())"
    : "";
  const res = await client.query(
    `SELECT id
       FROM esf7_submission_queue
      WHERE status = 'pending'${waiting}
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
  );
  return res.rows.length > 0 ? res.rows[0].id : null;
}

/**
 * Pick AND claim the oldest ready job in one statement, so the lock and the status change cannot be separated
 * (one statement is its own transaction, which also makes it safe behind PgBouncer in transaction mode).
 * Two workers calling this at the same time always get different jobs, or null.
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }} client
 * @returns {Promise<number | null>}
 */
async function claimNextPendingJob(client) {
  const waiting = (await hasRetryColumns(client))
    ? " AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())"
    : "";
  const res = await client.query(
    `UPDATE esf7_submission_queue
        SET status = 'processing', updated_at = NOW()
      WHERE id = (
        SELECT id
          FROM esf7_submission_queue
         WHERE status = 'pending'${waiting}
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id`,
  );
  return res.rows.length > 0 ? res.rows[0].id : null;
}

/**
 * Record a failed attempt. Below QUEUE_MAX_ATTEMPTS the job goes back to 'pending' with an exponential, jittered
 * delay (QUEUE_RETRY_BASE_MS doubling each attempt, capped at QUEUE_RETRY_MAX_MS). At the limit it becomes
 * 'failed' and stays in the table for an alert and a manual replay. Jobs are never deleted.
 * Without the retry columns it marks the job 'failed' straight away, as before.
 * @returns {Promise<{ status: string, attempts: number | null }>}
 */
async function recordJobFailure(client, jobId, message) {
  if (!(await hasRetryColumns(client))) {
    await client.query(
      `UPDATE esf7_submission_queue SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message, jobId],
    );
    return { status: "failed", attempts: null };
  }
  const res = await client.query(
    `UPDATE esf7_submission_queue
        SET attempts = COALESCE(attempts, 0) + 1,
            status = CASE WHEN COALESCE(attempts, 0) + 1 >= $3 THEN 'failed' ELSE 'pending' END,
            next_attempt_at = CASE
              WHEN COALESCE(attempts, 0) + 1 >= $3 THEN NULL
              ELSE NOW() + (LEAST($5::float8, $4::float8 * POWER(2, COALESCE(attempts, 0)))
                            * (0.5 + random() * 0.5)) * INTERVAL '1 millisecond'
            END,
            error_message = $1,
            updated_at = NOW()
      WHERE id = $2
      RETURNING status, attempts`,
    [
      message,
      jobId,
      maxAttempts(),
      positiveInt(process.env.QUEUE_RETRY_BASE_MS, DEFAULT_RETRY_BASE_MS),
      positiveInt(process.env.QUEUE_RETRY_MAX_MS, DEFAULT_RETRY_MAX_MS),
    ],
  );
  const row = res.rows[0] || { status: "failed", attempts: null };
  if (row.status === "failed") {
    console.error(
      `[Queue Worker] Job #${jobId} FAILED permanently after ${row.attempts} attempts: ${message}`,
    );
  }
  return row;
}

/** True when the job has used up its attempts. Its stream pointer can then be acknowledged: the row stays as 'failed'. */
async function isPermanentlyFailed(client, jobId) {
  const res = await client.query(
    `SELECT status FROM esf7_submission_queue WHERE id = $1`,
    [jobId],
  );
  return res.rows.length > 0 && res.rows[0].status === "failed";
}

module.exports = {
  claimJob,
  recoverStaleJobs,
  pickNextPendingJob,
  claimNextPendingJob,
  recordJobFailure,
  isPermanentlyFailed,
  isConsumerEnabled,
  hasRetryColumns,
  resetRetryColumnsCache,
};
