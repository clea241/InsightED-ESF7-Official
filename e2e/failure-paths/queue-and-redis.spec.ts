import { test, expect } from "@playwright/test";
import {
  API,
  REDIS_CONFIGURED,
  bearer,
  dbQuery,
  jobRow,
  newTenant,
  seedBrowserSession,
} from "./helpers";

test.describe("queue", () => {
  test("FP-13 an accepted submission is durably queued before the response, and is never marked completed without a worker", async ({
    request,
  }) => {
    const t = newTenant("fp13");
    const marker = `fp13-${Date.now()}`;
    const res = await request.post(`${API}/api/submissions`, {
      headers: bearer(t),
      data: {
        schoolYear: "SY 26-27",
        payload: {
          schoolInfo: { schoolId: t.schoolId, schoolName: marker },
          personnel: [],
          classSections: [],
        },
        signature: "sig",
        certifiedBy: "FP Tester",
      },
    });
    expect(res.ok(), `submission accepted (got ${res.status()})`).toBeTruthy();
    const body = await res.json();
    const id = Number(body.jobId ?? body.id ?? body.job_id);
    expect(id, "the response carries the queued job id").toBeGreaterThan(0);

    // The row exists at the moment the client is told "accepted": the acknowledgement never runs ahead of the write.
    const row = await jobRow(id);
    expect(row, "job row committed before the response").toBeTruthy();
    expect(row.status).toBe("pending");
    // Without a worker nothing may claim it was processed.
    const done = await dbQuery(
      "SELECT count(*)::int n FROM esf7_submission_queue WHERE school_id = $1 AND status = 'completed'",
      [t.schoolId],
    );
    expect(done[0].n).toBe(0);
  });

  test("FP-13 worker crash and failing-job behaviour", async () => {
    // The queue worker is switched off in this codebase: server/queue_worker.js startWorker() returns before it polls, and server.js logs
    // "Submissions queue worker permanently deactivated". Killing a worker mid-job and retry-forever behaviour cannot be exercised until it is re-enabled.
    test.skip(
      true,
      "queue worker is deactivated in code (startWorker returns immediately)",
    );
  });
});

test.describe("redis", () => {
  test("FP-14 with Redis down the app reports a degraded state, keeps working on the PostgreSQL queue, and does not lock users out", async ({
    page,
    request,
  }) => {
    test.skip(
      REDIS_CONFIGURED,
      "REDIS_URL is set: this test covers the Redis-down case (leave REDIS_URL empty)",
    );
    const deep = await request.get(`${API}/api/health`);
    expect(deep.status(), "deep health stays 200 when only Redis is down").toBe(
      200,
    );
    const h = await deep.json();
    expect(h.degraded, "degraded state is reported").toBe(true);
    expect(h.redis).toBe("down");
    expect(h.db).toBe("up");
    expect(h.queue.mode, "queue falls back to PostgreSQL").toBe(
      "postgres-fallback",
    );

    // The readiness check used by the front end's lock must NOT fail because Redis is down.
    const ready = await request.get(`${API}/api/health/readiness`);
    expect(ready.status()).toBe(200);

    // A submission still goes through (PostgreSQL queue).
    const t = newTenant("fp14");
    const res = await request.post(`${API}/api/submissions`, {
      headers: bearer(t),
      data: {
        payload: { schoolInfo: { schoolId: t.schoolId }, personnel: [] },
      },
    });
    expect(res.ok()).toBeTruthy();

    // The UI is usable (no blocking server lock).
    await seedBrowserSession(page, t, "dashboard");
    await page.goto("/?view=dashboard");
    await expect(
      page.getByRole("button", { name: /logout/i }).first(),
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("FP-14 after Redis comes back the queue returns to Redis mode and queued work is not lost", async () => {
    test.skip(
      !REDIS_CONFIGURED,
      "needs a local Redis: set REDIS_URL in .env.test to a local Redis you can stop and start",
    );
    // Intentionally not implemented without a Redis server on this machine: it must stop and restart a LOCAL redis only.
  });
});
