// The three SQL statements that decide who may process a submission job. They live here (not inline in
// queue_worker.js) so the integration tests exercise exactly the SQL that production runs.

/**
 * Atomically claim a job: only one caller can move it to 'processing'.
 * Returns false when another worker already holds it or it is already completed.
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }} client
 * @param {number} jobId
 */
async function claimJob(client, jobId) {
  const res = await client.query(
    `UPDATE esf7_submission_queue
        SET status = 'processing', updated_at = NOW()
      WHERE id = $1 AND status <> 'processing' AND status <> 'completed'
      RETURNING id`,
    [jobId]
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
        AND updated_at < NOW() - INTERVAL '1 minute'`
  );
}

/**
 * Pick the oldest pending job, skipping rows other workers have locked.
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }} client
 * @returns {Promise<number | null>}
 */
async function pickNextPendingJob(client) {
  const res = await client.query(
    `SELECT id
       FROM esf7_submission_queue
      WHERE status = 'pending'
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`
  );
  return res.rows.length > 0 ? res.rows[0].id : null;
}

module.exports = { claimJob, recoverStaleJobs, pickNextPendingJob };
