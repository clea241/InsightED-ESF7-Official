// Idempotent submission insert (submission_id) for POST /api/submissions and POST /api/validation/resubmit,
// against a disposable PostgreSQL (see helpers.mjs).
import { execFileSync } from "node:child_process";
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
  pointServerAtTestDatabase,
  nodeRequire,
} from "./helpers.mjs";

const ID_A = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f";
const ID_B = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

describe.skipIf(!TEST_DATABASE_URL)("submission_id idempotency", () => {
  let pool;
  let server;
  let base;
  let redisQueue;
  let queueModule;
  const originalPublish = () => redisQueue.__original;

  const post = (path, body) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const rows = async () =>
    (await pool.query("SELECT * FROM esf7_submission_queue ORDER BY id")).rows;
  const body = (extra = {}) => ({
    schoolId: "302261",
    schoolYear: "SY 26-27",
    payload: { schoolInfo: { schoolId: "302261" } },
    signature: "sig",
    certifiedBy: "Head",
    ...extra,
  });

  beforeAll(async () => {
    pointServerAtTestDatabase();
    const { Pool } = nodeRequire("pg");
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
    redisQueue = nodeRequire("../../services/redisQueue.js");
    redisQueue.__original = redisQueue.publishSubmissionJob;
    queueModule = nodeRequire("../../services/submissionQueue.js");

    const express = nodeRequire("express");
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use(
      "/api/submissions",
      nodeRequire("../../controllers/submissions/index.js"),
    );
    app.use(
      "/api/validation",
      nodeRequire("../../controllers/validation/index.js"),
    );
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (redisQueue) redisQueue.publishSubmissionJob = redisQueue.__original;
    if (server) server.close();
    if (pool) await pool.end();
  });

  async function migrate(down = false) {
    const u = new URL(TEST_DATABASE_URL);
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            "../../migrations/add_queue_submission_id.js",
            import.meta.url,
          ),
        ),
        ...(down ? ["--down"] : []),
      ],
      {
        env: {
          ...process.env,
          TEST_DATABASE_URL,
          DATABASE_URL: TEST_DATABASE_URL,
          PRIMARY_DATABASE_URL: TEST_DATABASE_URL,
          DB_HOST: u.hostname,
          DB_PORT: u.port,
          DB_NAME: u.pathname.slice(1),
          DB_USER: decodeURIComponent(u.username),
          DB_PASSWORD: decodeURIComponent(u.password),
          DB_SSL: "false",
        },
        stdio: "pipe",
      },
    );
  }

  beforeEach(async () => {
    await pool.query(SCHEMA_SQL);
    queueModule.resetSubmissionIdColumnCache();
    redisQueue.publishSubmissionJob = async () => ({ success: true }); // Redis is not under test here
    delete process.env.QUEUE_PUBLISH_TIMEOUT_MS;
  });
  afterEach(() => {
    redisQueue.publishSubmissionJob = originalPublish();
  });

  describe("with the migration applied", () => {
    beforeEach(async () => {
      await migrate();
    });

    test("double submit with the same submissionId produces one row and the same job", async () => {
      const first = await post(
        "/api/submissions",
        body({ submissionId: ID_A }),
      );
      const second = await post(
        "/api/submissions",
        body({ submissionId: ID_A }),
      );
      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      const a = await first.json();
      const b = await second.json();
      expect(b.jobId).toBe(a.jobId);
      expect(b).toMatchObject({ success: true, status: "pending" });
      expect(b).toHaveProperty("queuePosition");
      expect(await rows()).toHaveLength(1);
    });

    test("different submissionIds produce two rows", async () => {
      await post("/api/submissions", body({ submissionId: ID_A }));
      await post("/api/submissions", body({ submissionId: ID_B }));
      expect(await rows()).toHaveLength(2);
    });

    test("the same submissionId for a different school is a different submission", async () => {
      await post("/api/submissions", body({ submissionId: ID_A }));
      await post(
        "/api/submissions",
        body({ schoolId: "100005", submissionId: ID_A }),
      );
      expect(await rows()).toHaveLength(2);
    });

    test("no submissionId behaves as before: every call inserts a row, same response shape", async () => {
      const r1 = await post("/api/submissions", body());
      const r2 = await post("/api/submissions", body());
      const j1 = await r1.json();
      const j2 = await r2.json();
      expect(r1.status).toBe(202);
      expect(Object.keys(j1).sort()).toEqual([
        "jobId",
        "queuePosition",
        "status",
        "success",
      ]);
      expect(j2.jobId).not.toBe(j1.jobId);
      const all = await rows();
      expect(all).toHaveLength(2);
      expect(all.every((r) => r.submission_id === null)).toBe(true);
    });

    test("a repeat after the job completed returns the completed status and no queue position", async () => {
      const first = await (
        await post("/api/submissions", body({ submissionId: ID_A }))
      ).json();
      await pool.query(
        "UPDATE esf7_submission_queue SET status = 'completed' WHERE id = $1",
        [first.jobId],
      );
      const again = await post(
        "/api/submissions",
        body({ submissionId: ID_A }),
      );
      expect(again.status).toBe(202);
      expect(await again.json()).toMatchObject({
        jobId: first.jobId,
        status: "completed",
        queuePosition: 0,
      });
      expect(await rows()).toHaveLength(1);
    });

    test("an invalid submissionId is rejected with 400 and nothing is queued", async () => {
      const res = await post(
        "/api/submissions",
        body({ submissionId: "not-a-uuid" }),
      );
      expect(res.status).toBe(400);
      expect(await rows()).toHaveLength(0);
    });

    test("the row is committed before the Redis pointer is published", async () => {
      let seenAtPublish = null;
      redisQueue.publishSubmissionJob = async ({ jobId }) => {
        const r = await pool.query(
          "SELECT status FROM esf7_submission_queue WHERE id = $1",
          [jobId],
        );
        seenAtPublish = r.rows[0] ? r.rows[0].status : "missing";
        return { success: true };
      };
      const res = await post("/api/submissions", body({ submissionId: ID_A }));
      expect(res.status).toBe(202);
      expect(seenAtPublish).toBe("pending");
    });

    test("Redis publish failing still commits the row and returns 202", async () => {
      redisQueue.publishSubmissionJob = async () => {
        throw new Error("Redis exploded");
      };
      const res = await post("/api/submissions", body({ submissionId: ID_A }));
      expect(res.status).toBe(202);
      expect(await rows()).toHaveLength(1);
    });

    test("Redis hanging does not hold the 202 past QUEUE_PUBLISH_TIMEOUT_MS", async () => {
      process.env.QUEUE_PUBLISH_TIMEOUT_MS = "100";
      redisQueue.publishSubmissionJob = () => new Promise(() => {});
      const started = Date.now();
      const res = await post("/api/submissions", body({ submissionId: ID_A }));
      expect(res.status).toBe(202);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(await rows()).toHaveLength(1);
    });

    test("a duplicate whose job is still pending re-publishes the pointer; a completed one does not", async () => {
      let publishes = 0;
      redisQueue.publishSubmissionJob = async () => {
        publishes++;
        return { success: true };
      };
      const first = await (
        await post("/api/submissions", body({ submissionId: ID_A }))
      ).json();
      await post("/api/submissions", body({ submissionId: ID_A }));
      expect(publishes).toBe(2);
      await pool.query(
        "UPDATE esf7_submission_queue SET status = 'completed' WHERE id = $1",
        [first.jobId],
      );
      await post("/api/submissions", body({ submissionId: ID_A }));
      expect(publishes).toBe(2);
    });

    test("validation resubmit shares the same behaviour", async () => {
      const resubmit = (extra) => post("/api/validation/resubmit", body(extra));
      const r1 = await resubmit({ submissionId: ID_A });
      const r2 = await resubmit({ submissionId: ID_A });
      expect(r1.status).toBe(200);
      const j1 = await r1.json();
      const j2 = await r2.json();
      expect(j2.jobId).toBe(j1.jobId);
      expect(j1.status).toBe("RESUBMITTED");
      expect(await rows()).toHaveLength(1);
      await resubmit({ submissionId: ID_B });
      await resubmit({});
      await resubmit({});
      expect(await rows()).toHaveLength(4);
      expect((await resubmit({ submissionId: "nope" })).status).toBe(400);
    });

    test("the migration is reversible", async () => {
      await migrate(true);
      const cols = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'esf7_submission_queue' AND column_name = 'submission_id'",
      );
      expect(cols.rows).toHaveLength(0);
      await migrate(); // and re-applicable
      const again = await pool.query(
        "SELECT 1 FROM pg_indexes WHERE indexname = 'uq_esf7_submission_queue_school_submission'",
      );
      expect(again.rows).toHaveLength(1);
    });
  });

  test("before the migration submissionId is ignored and behaviour is unchanged", async () => {
    const first = await post("/api/submissions", body({ submissionId: ID_A }));
    const second = await post("/api/submissions", body({ submissionId: ID_A }));
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await rows()).toHaveLength(2);
  });
});
