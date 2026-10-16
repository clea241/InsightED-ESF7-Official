// One place that puts a certified submission into esf7_submission_queue, used by POST /api/submissions and
// POST /api/validation/resubmit so both behave the same way.
//
// Order: (1) commit the row to PostgreSQL, (2) publish the Redis pointer, (3) the caller answers 202.
// The row is the durable copy; the Redis pointer only wakes a worker, so a failed or slow publish never loses a
// submission. No payload goes into Redis.
//
// Idempotency: when the client sends a submissionId (a UUID generated once per certify click and reused on every
// retry) a repeat insert hits the unique index (school_id, submission_id), does nothing, and returns the existing row.
// Needs server/migrations/add_queue_submission_id.js; until it has run, submissionId is ignored and every call
// inserts a new row, exactly as before.
const redisQueue = require("./redisQueue");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PUBLISH_TIMEOUT_MS = 2000;

class InvalidSubmissionIdError extends Error {
  constructor() {
    super("submissionId must be a UUID");
    this.name = "InvalidSubmissionIdError";
    this.status = 400;
  }
}

/** Returns a lower-cased UUID, null when the client sent none, or throws InvalidSubmissionIdError. */
function parseSubmissionId(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const text = String(raw).trim();
  if (!UUID_RE.test(text)) throw new InvalidSubmissionIdError();
  return text.toLowerCase();
}

let columnCache = { value: null, checkedAt: 0 };
function resetSubmissionIdColumnCache() {
  columnCache = { value: null, checkedAt: 0 };
}
async function hasSubmissionIdColumn(db) {
  if (
    columnCache.value !== null &&
    Date.now() - columnCache.checkedAt < 60000
  ) {
    return columnCache.value;
  }
  const res = await db.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'esf7_submission_queue'
        AND column_name = 'submission_id'`,
  );
  columnCache = { value: res.rows.length > 0, checkedAt: Date.now() };
  return columnCache.value;
}

/**
 * Insert (or find) the queue row. `db` only needs a query(sql, params) method.
 * @returns {Promise<{ jobId: number, status: string, createdAt: any, duplicate: boolean }>}
 */
async function insertSubmission(
  db,
  { schoolId, schoolYear, payloadJson, signature, certifiedBy, submissionId },
) {
  const id = parseSubmissionId(submissionId);
  const values = [schoolId, schoolYear, payloadJson, signature, certifiedBy];

  if (id && (await hasSubmissionIdColumn(db))) {
    const inserted = await db.query(
      `INSERT INTO esf7_submission_queue (school_id, school_year, payload, signature, certified_by, status, submission_id)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       ON CONFLICT (school_id, submission_id) DO NOTHING
       RETURNING id, status, created_at`,
      [...values, id],
    );
    if (inserted.rows.length > 0) {
      const row = inserted.rows[0];
      return {
        jobId: row.id,
        status: row.status,
        createdAt: row.created_at,
        duplicate: false,
      };
    }
    // Same school and submissionId already queued: answer with that row instead of an error.
    const existing = await db.query(
      `SELECT id, status, created_at
         FROM esf7_submission_queue
        WHERE school_id = $1 AND submission_id = $2`,
      [schoolId, id],
    );
    const row = existing.rows[0];
    return {
      jobId: row.id,
      status: row.status,
      createdAt: row.created_at,
      duplicate: true,
    };
  }

  const inserted = await db.query(
    `INSERT INTO esf7_submission_queue (school_id, school_year, payload, signature, certified_by, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id, status, created_at`,
    values,
  );
  const row = inserted.rows[0];
  return {
    jobId: row.id,
    status: row.status,
    createdAt: row.created_at,
    duplicate: false,
  };
}

/**
 * Publish the Redis pointer for a committed row. Never throws and never waits longer than
 * QUEUE_PUBLISH_TIMEOUT_MS: the row is already durable, so a failed publish only delays pickup until a worker
 * sweeps PostgreSQL.
 */
async function publishPointer({ jobId, schoolId, schoolYear }) {
  const timeoutMs =
    Number.parseInt(process.env.QUEUE_PUBLISH_TIMEOUT_MS, 10) > 0
      ? Number.parseInt(process.env.QUEUE_PUBLISH_TIMEOUT_MS, 10)
      : DEFAULT_PUBLISH_TIMEOUT_MS;
  let timer;
  try {
    return await Promise.race([
      redisQueue.publishSubmissionJob({ jobId, schoolId, schoolYear }),
      new Promise((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              success: false,
              mode: "postgres_fallback",
              error: "publish timeout",
            }),
          timeoutMs,
        );
      }),
    ]);
  } catch (err) {
    console.warn(`[Redis Queue Stream Dispatch Warn]: ${err.message}`);
    return { success: false, mode: "postgres_fallback", error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Insert, then publish the pointer. A duplicate only re-publishes while the job is still waiting to be processed. */
async function enqueueSubmission(db, input) {
  const result = await insertSubmission(db, input);
  if (!result.duplicate || result.status === "pending") {
    await publishPointer({
      jobId: result.jobId,
      schoolId: input.schoolId,
      schoolYear: input.schoolYear,
    });
  }
  return result;
}

module.exports = {
  enqueueSubmission,
  insertSubmission,
  publishPointer,
  parseSubmissionId,
  InvalidSubmissionIdError,
  resetSubmissionIdColumnCache,
};
