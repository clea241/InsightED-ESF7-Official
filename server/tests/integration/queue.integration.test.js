// Submission queue semantics against real PostgreSQL (and real Redis when TEST_REDIS_URL is set):
// exactly-once claiming, parallel workers, crashed-worker retry, stream redelivery of unacknowledged jobs.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { TEST_DATABASE_URL, TEST_REDIS_URL, SCHEMA_SQL, pointServerAtTestDatabase, nodeRequire } from './helpers.mjs';

describe.skipIf(!TEST_DATABASE_URL)('PostgreSQL queue (fallback mode semantics)', () => {
  let pool;
  let claims;

  beforeAll(async () => {
    pointServerAtTestDatabase();
    const { Pool } = nodeRequire('pg');
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 20 });
    claims = nodeRequire('../../services/queueClaims.js');
  });
  beforeEach(async () => {
    await pool.query(SCHEMA_SQL);
    await pool.query("INSERT INTO esf7_submission_queue (school_id, payload) SELECT '302261', '{}'::jsonb FROM generate_series(1, 20)");
  });
  afterAll(async () => { if (pool) await pool.end(); });

  test('the same job delivered to many workers at once is claimed by exactly one', async () => {
    const attempts = await Promise.all(Array.from({ length: 12 }, async () => {
      const c = await pool.connect();
      try { return await claims.claimJob(c, 1); } finally { c.release(); }
    }));
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect((await pool.query('SELECT status FROM esf7_submission_queue WHERE id = 1')).rows[0].status).toBe('processing');
  });

  test('a completed job can never be claimed again (no duplicate processing)', async () => {
    await pool.query("UPDATE esf7_submission_queue SET status = 'completed' WHERE id = 2");
    const c = await pool.connect();
    try { expect(await claims.claimJob(c, 2)).toBe(false); } finally { c.release(); }
  });

  test('a failed job can be claimed again (retry), and the failure is visible meanwhile', async () => {
    await pool.query("UPDATE esf7_submission_queue SET status = 'failed', error_message = 'Step 3/8: boom' WHERE id = 3");
    expect((await pool.query('SELECT error_message FROM esf7_submission_queue WHERE id = 3')).rows[0].error_message).toMatch(/boom/);
    const c = await pool.connect();
    try { expect(await claims.claimJob(c, 3)).toBe(true); } finally { c.release(); }
  });

  test('parallel workers using FOR UPDATE SKIP LOCKED each get a different job, none twice, none skipped', async () => {
    const taken = await Promise.all(Array.from({ length: 10 }, async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const id = await claims.pickNextPendingJob(c);
        if (id !== null) await claims.claimJob(c, id);
        await new Promise((r) => setTimeout(r, 30)); // hold the row lock so the others must skip it
        await c.query('COMMIT');
        return id;
      } finally { c.release(); }
    }));
    expect(taken.every((id) => id !== null)).toBe(true);
    expect(new Set(taken).size).toBe(10);
    const processing = Number((await pool.query("SELECT count(*) FROM esf7_submission_queue WHERE status = 'processing'")).rows[0].count);
    expect(processing).toBe(10);
  });

  test('a worker killed mid-job: the job is retried after a minute, but a live job is left alone', async () => {
    await pool.query("UPDATE esf7_submission_queue SET status = 'processing', updated_at = NOW() - INTERVAL '2 minutes' WHERE id = 4"); // crashed worker
    await pool.query("UPDATE esf7_submission_queue SET status = 'processing', updated_at = NOW() WHERE id = 5"); // healthy worker
    const c = await pool.connect();
    try {
      await claims.recoverStaleJobs(c);
      const rows = (await c.query('SELECT id, status FROM esf7_submission_queue WHERE id IN (4,5) ORDER BY id')).rows;
      expect(rows).toEqual([{ id: 4, status: 'pending' }, { id: 5, status: 'processing' }]);
      expect(await claims.claimJob(c, 4)).toBe(true); // retried
    } finally { c.release(); }
  });

  test('jobs queued while Redis was down are all still pending and picked in order (nothing stranded)', async () => {
    const c = await pool.connect();
    try {
      const order = [];
      for (let i = 0; i < 5; i++) {
        const id = await claims.pickNextPendingJob(c);
        order.push(id);
        await claims.claimJob(c, id);
      }
      expect(order).toEqual([1, 2, 3, 4, 5]);
    } finally { c.release(); }
  });
});

describe.skipIf(!TEST_REDIS_URL)('Redis stream mode', () => {
  let redisQueue;
  let raw;

  beforeAll(async () => {
    process.env.REDIS_URL = TEST_REDIS_URL;
    process.env.REDIS_STREAM_KEY = `esf7:test:${Date.now()}`;
    process.env.REDIS_GROUP_NAME = 'esf7_test_group';
    redisQueue = nodeRequire('../../services/redisQueue.js');
    raw = redisQueue.getRedisClient();
    redisQueue.startMonitor();
    await redisQueue.initRedisStream();
  });
  afterAll(async () => {
    if (raw) {
      await raw.del(redisQueue.STREAM_KEY).catch(() => {}); // only our own unique test key
      raw.disconnect();
    }
  });

  test('reports redis mode once connected', async () => {
    await new Promise((r) => setTimeout(r, 500));
    expect(redisQueue.getQueueStatus()).toMatchObject({ mode: 'redis', redisReachable: true });
  });

  test('a delivered but never acknowledged job (worker killed) is redelivered by drainPendingEntries, then acknowledged once', async () => {
    await redisQueue.publishSubmissionJob({ jobId: 41, schoolId: '302261', schoolYear: '2026-2027' });
    const delivered = await redisQueue.readNextStreamJob({ consumerName: 'worker-that-dies', blockMs: 500 });
    expect(delivered.jobId).toBe(41);
    // ...worker dies here without acking...
    const claimed = await redisQueue.drainPendingEntries({ consumerName: 'worker-2', minIdleTimeMs: 0 });
    expect(claimed.map((e) => e.jobId)).toEqual([41]);
    expect(await redisQueue.ackJob(claimed[0].messageId)).toBe(true);
    const again = await redisQueue.drainPendingEntries({ consumerName: 'worker-3', minIdleTimeMs: 0 });
    expect(again).toEqual([]); // acknowledged: gone for good, not processed a second time
  });

  test('an acknowledged job is not delivered again', async () => {
    await redisQueue.publishSubmissionJob({ jobId: 42, schoolId: '302261', schoolYear: '2026-2027' });
    const e = await redisQueue.readNextStreamJob({ consumerName: 'worker-a', blockMs: 500 });
    await redisQueue.ackJob(e.messageId);
    const next = await redisQueue.readNextStreamJob({ consumerName: 'worker-b', blockMs: 200 });
    expect(next).toBeNull();
  });
});
