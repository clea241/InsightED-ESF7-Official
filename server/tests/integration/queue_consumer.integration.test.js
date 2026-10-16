// Queue consumer behind QUEUE_CONSUMER_ENABLED: atomic claiming, retries with backoff, and one real job end to end.
// Runs only against a disposable database (see helpers.mjs).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "vitest";
import {
  TEST_DATABASE_URL,
  SCHEMA_SQL,
  applyAppSchema,
  pointServerAtTestDatabase,
  nodeRequire,
} from "./helpers.mjs";

const RETRY_COLUMNS_SQL = `
  ALTER TABLE esf7_submission_queue
    ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
`;

describe("QUEUE_CONSUMER_ENABLED flag", () => {
  const saved = process.env.QUEUE_CONSUMER_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.QUEUE_CONSUMER_ENABLED;
    else process.env.QUEUE_CONSUMER_ENABLED = saved;
  });

  test("is off unless explicitly set to true", () => {
    const { isConsumerEnabled } = nodeRequire("../../services/queueClaims.js");
    delete process.env.QUEUE_CONSUMER_ENABLED;
    expect(isConsumerEnabled()).toBe(false);
    process.env.QUEUE_CONSUMER_ENABLED = "false";
    expect(isConsumerEnabled()).toBe(false);
    process.env.QUEUE_CONSUMER_ENABLED = "1";
    expect(isConsumerEnabled()).toBe(false);
    process.env.QUEUE_CONSUMER_ENABLED = "TRUE";
    expect(isConsumerEnabled()).toBe(true);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("queue claiming and retries", () => {
  let pool;
  let claims;

  beforeAll(async () => {
    pointServerAtTestDatabase();
    const { Pool } = nodeRequire("pg");
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 25 });
    claims = nodeRequire("../../services/queueClaims.js");
  });
  afterAll(async () => {
    if (pool) await pool.end();
  });

  async function seed(withRetryColumns, rows = 20) {
    await pool.query(SCHEMA_SQL);
    if (withRetryColumns) await pool.query(RETRY_COLUMNS_SQL);
    await pool.query(
      `INSERT INTO esf7_submission_queue (school_id, payload) SELECT '302261', '{}'::jsonb FROM generate_series(1, ${rows})`,
    );
    claims.resetRetryColumnsCache();
  }

  describe.each([
    ["without retry columns", false],
    ["with retry columns", true],
  ])("claimNextPendingJob %s", (_label, withCols) => {
    beforeEach(() => seed(withCols));

    test("many workers at once never receive the same job, and none is skipped", async () => {
      // No surrounding transaction: this is how the worker calls it (autocommit, one statement).
      const taken = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const c = await pool.connect();
          try {
            return await claims.claimNextPendingJob(c);
          } finally {
            c.release();
          }
        }),
      );
      expect(taken.every((id) => id !== null)).toBe(true);
      expect(new Set(taken).size).toBe(20);
      const left = await pool.query(
        "SELECT count(*)::int AS n FROM esf7_submission_queue WHERE status = 'pending'",
      );
      expect(left.rows[0].n).toBe(0);
    });

    test("returns null when nothing is pending", async () => {
      await pool.query("UPDATE esf7_submission_queue SET status = 'completed'");
      const c = await pool.connect();
      try {
        expect(await claims.claimNextPendingJob(c)).toBeNull();
      } finally {
        c.release();
      }
    });
  });

  describe("recordJobFailure", () => {
    beforeEach(() => seed(true, 3));
    afterEach(() => {
      delete process.env.QUEUE_MAX_ATTEMPTS;
      delete process.env.QUEUE_RETRY_BASE_MS;
    });

    test("retries with a growing delay, then marks the job failed at QUEUE_MAX_ATTEMPTS and never deletes it", async () => {
      process.env.QUEUE_MAX_ATTEMPTS = "3";
      process.env.QUEUE_RETRY_BASE_MS = "10000";
      const c = await pool.connect();
      try {
        const delays = [];
        for (let i = 1; i <= 2; i++) {
          await claims.claimJob(c, 1).catch(() => {});
          await pool.query(
            "UPDATE esf7_submission_queue SET status = 'processing', next_attempt_at = NULL WHERE id = 1",
          );
          const r = await claims.recordJobFailure(c, 1, `boom ${i}`);
          expect(r).toMatchObject({ status: "pending", attempts: i });
          const row = (
            await pool.query(
              "SELECT EXTRACT(EPOCH FROM (next_attempt_at - NOW())) AS secs FROM esf7_submission_queue WHERE id = 1",
            )
          ).rows[0];
          delays.push(Number(row.secs));
        }
        // base 10 s, jitter 50-100%: attempt 1 waits 5-10 s, attempt 2 waits 10-20 s.
        expect(delays[0]).toBeGreaterThan(3);
        expect(delays[0]).toBeLessThanOrEqual(10.5);
        expect(delays[1]).toBeGreaterThan(8);
        expect(delays[1]).toBeLessThanOrEqual(20.5);

        const last = await claims.recordJobFailure(c, 1, "boom 3");
        expect(last).toMatchObject({ status: "failed", attempts: 3 });
        const row = (
          await pool.query(
            "SELECT status, next_attempt_at, error_message FROM esf7_submission_queue WHERE id = 1",
          )
        ).rows[0];
        expect(row.status).toBe("failed");
        expect(row.next_attempt_at).toBeNull();
        expect(row.error_message).toBe("boom 3");
        expect(await claims.isPermanentlyFailed(c, 1)).toBe(true);
        const total = await pool.query(
          "SELECT count(*)::int AS n FROM esf7_submission_queue",
        );
        expect(total.rows[0].n).toBe(3);
      } finally {
        c.release();
      }
    });

    test("a job waiting out its retry delay is not claimed or picked, and is once the delay passes", async () => {
      const c = await pool.connect();
      try {
        await pool.query(
          "UPDATE esf7_submission_queue SET status = 'pending', next_attempt_at = NOW() + INTERVAL '1 hour' WHERE id = 1",
        );
        expect(await claims.claimJob(c, 1)).toBe(false);
        expect(await claims.claimNextPendingJob(c)).toBe(2); // skips job 1
        await pool.query(
          "UPDATE esf7_submission_queue SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE id = 1",
        );
        expect(await claims.claimJob(c, 1)).toBe(true);
      } finally {
        c.release();
      }
    });
  });

  test("without the retry columns a failure marks the job failed at once (previous behaviour)", async () => {
    await seed(false, 1);
    const c = await pool.connect();
    try {
      const r = await claims.recordJobFailure(c, 1, "boom");
      expect(r).toEqual({ status: "failed", attempts: null });
    } finally {
      c.release();
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)("worker end to end", () => {
  let pool;
  let worker;
  const savedFlag = process.env.QUEUE_CONSUMER_ENABLED;

  beforeAll(async () => {
    pointServerAtTestDatabase();
    const { Pool } = nodeRequire("pg");
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
    await applyAppSchema(pool);
    // Production gets these columns from the startup block in server.js, which schema.sql does not include.
    const serverJs = readFileSync(
      fileURLToPath(new URL("../../server.js", import.meta.url)),
      "utf8",
    );
    for (const stmt of serverJs.match(
      /ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS [^;\n]+;/g,
    ) || []) {
      await pool.query(stmt).catch(() => {});
    }
    // Not created by schema.sql, server.js or any migration in the repo, yet queue_worker.js writes them (see PR notes).
    await pool.query(`ALTER TABLE esf7_school_profile
      ADD COLUMN IF NOT EXISTS has_elem_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS elem_inclusive_programs JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS has_jhs_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS jhs_inclusive_programs JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS has_shs_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS shs_inclusive_programs JSONB DEFAULT '[]'::jsonb`);
    // schema.sql lacks raw_payload on some tables the worker still writes (esf7_personnel_employment, ...).
    await pool.query(`DO $$ DECLARE t text; BEGIN
      FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name LIKE 'esf7_%' AND table_type = 'BASE TABLE' LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT ''{}''::jsonb', t);
      END LOOP; END $$`);
    await pool.query(SCHEMA_SQL);
    await pool.query(RETRY_COLUMNS_SQL);
    nodeRequire("../../services/queueClaims.js").resetRetryColumnsCache();
    worker = nodeRequire("../../queue_worker.js");
  });
  afterAll(async () => {
    if (savedFlag === undefined) delete process.env.QUEUE_CONSUMER_ENABLED;
    else process.env.QUEUE_CONSUMER_ENABLED = savedFlag;
    if (pool) await pool.end();
  });

  const payload = {
    schoolInfo: { schoolId: "302261", schoolName: "Queue Test ES" },
    personnel: [
      {
        id: "PER-302261-001",
        firstName: "Juan",
        lastName: "Cruz",
        type: "teaching",
        position: "TEACHER I",
      },
    ],
  };

  test("flag off: a pending job is left alone", async () => {
    delete process.env.QUEUE_CONSUMER_ENABLED;
    await pool.query("DELETE FROM esf7_submission_queue");
    await pool.query(
      "INSERT INTO esf7_submission_queue (school_id, payload) VALUES ('302261', $1)",
      [JSON.stringify(payload)],
    );
    expect(await worker.processNextJob()).toBe(false);
    const r = await pool.query("SELECT status FROM esf7_submission_queue");
    expect(r.rows[0].status).toBe("pending");
  });

  test("flag on: a pending job reaches completed and normalized rows exist", async () => {
    process.env.QUEUE_CONSUMER_ENABLED = "true";
    expect(await worker.processNextJob()).toBe(true);
    const job = await pool.query(
      "SELECT status, error_message FROM esf7_submission_queue",
    );
    expect(job.rows[0]).toMatchObject({ status: "completed" });
    const prof = await pool.query(
      "SELECT count(*)::int AS n FROM esf7_school_profile WHERE school_id = '302261'",
    );
    expect(prof.rows[0].n).toBeGreaterThan(0);
    const pers = await pool.query(
      "SELECT count(*)::int AS n FROM esf7_personnel_profile",
    );
    expect(pers.rows[0].n).toBeGreaterThan(0);
  });
});
