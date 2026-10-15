import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";

const nodeRequire = createRequire(import.meta.url);
const { poolMax, connectTimeoutMs, positiveIntEnv, DEFAULT_POOL_MAX } =
  nodeRequire("../../db/poolConfig.js");
const { isPoolAcquireTimeout, jitteredRetryAfterSeconds, poolTimeoutHandler } =
  nodeRequire("../../utils/poolErrors.js");

const quiet = () => {};

test("defaults equal the previous hard-coded pool sizes and timeout", () => {
  expect(DEFAULT_POOL_MAX).toEqual({
    PG_POOL_MAX_PRIMARY: 8,
    PG_POOL_MAX_STAGING: 5,
    PG_POOL_MAX_PROD: 8,
    PG_POOL_MAX_INSIGHTED: 5,
    PG_POOL_MAX_USERS: 4,
  });
  for (const [name, value] of Object.entries(DEFAULT_POOL_MAX)) {
    expect(poolMax(name, {}, quiet)).toBe(value);
  }
  expect(connectTimeoutMs({}, quiet)).toBe(15000);
});

test("env overrides apply; invalid values fall back and warn", () => {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  expect(poolMax("PG_POOL_MAX_USERS", { PG_POOL_MAX_USERS: "3" }, warn)).toBe(
    3,
  );
  expect(positiveIntEnv("X", 7, { X: "0" }, warn)).toBe(7);
  expect(positiveIntEnv("X", 7, { X: "-2" }, warn)).toBe(7);
  expect(positiveIntEnv("X", 7, { X: "4.5" }, warn)).toBe(7);
  expect(positiveIntEnv("X", 7, { X: "abc" }, warn)).toBe(7);
  expect(positiveIntEnv("X", 7, { X: "" }, warn)).toBe(7); // empty counts as unset, no warning
  expect(warnings).toHaveLength(4);
  expect(connectTimeoutMs({ PG_CONNECT_TIMEOUT_MS: "5000" }, warn)).toBe(5000);
});

test("a worker process sizes its primary pool with PG_POOL_MAX_WORKER; web processes are unaffected", () => {
  const env = { DB_POOL_ROLE: "worker", PG_POOL_MAX_WORKER: "5" };
  expect(poolMax("PG_POOL_MAX_PRIMARY", env, quiet)).toBe(5);
  expect(
    poolMax("PG_POOL_MAX_PRIMARY", { PG_POOL_MAX_WORKER: "5" }, quiet),
  ).toBe(8);
  // worker role without PG_POOL_MAX_WORKER keeps today's value
  expect(
    poolMax("PG_POOL_MAX_PRIMARY", { DB_POOL_ROLE: "worker" }, quiet),
  ).toBe(8);
  expect(
    poolMax(
      "PG_POOL_MAX_PRIMARY",
      { DB_POOL_ROLE: "worker", PG_POOL_MAX_PRIMARY: "6" },
      quiet,
    ),
  ).toBe(6);
});

test("only pool-acquire timeouts are recognised", () => {
  expect(
    isPoolAcquireTimeout(new Error("timeout exceeded when trying to connect")),
  ).toBe(true);
  expect(
    isPoolAcquireTimeout(
      new Error("Connection terminated due to connection timeout"),
    ),
  ).toBe(true);
  expect(isPoolAcquireTimeout(new Error("query_wait_timeout"))).toBe(true);
  expect(
    isPoolAcquireTimeout(
      new Error('duplicate key value violates unique constraint "x"'),
    ),
  ).toBe(false);
  expect(
    isPoolAcquireTimeout(
      new Error("canceling statement due to statement timeout"),
    ),
  ).toBe(false);
  expect(isPoolAcquireTimeout(null)).toBe(false);
});

test("Retry-After is a whole number of seconds from 1 to 5", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(jitteredRetryAfterSeconds());
  expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  expect(jitteredRetryAfterSeconds(() => 0.999999)).toBe(5);
  expect(jitteredRetryAfterSeconds(() => 0)).toBe(1);
});

// Fake database client: connects instantly and never fails, so a real pg-pool at max=1 can be exhausted for real.
class FakeClient extends EventEmitter {
  connect(cb) {
    if (cb) return cb();
    return Promise.resolve();
  }
  query(...args) {
    const result = { rows: [], rowCount: 0 };
    const cb = args.find((a) => typeof a === "function");
    if (cb) return cb(null, result); // pg-pool's pool.query() passes a callback
    return Promise.resolve(result);
  }
  end(cb) {
    this.emit("end");
    if (cb) cb();
  }
}

async function startApp(routes) {
  const express = nodeRequire("express");
  const app = express();
  routes(app);
  app.use(poolTimeoutHandler);
  // Stand-in for the global handler in server.js, to prove other errors are left to it.
  app.use((err, req, res, next) =>
    res.status(500).json({ error: "global:" + err.message }),
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test("a real exhausted pool yields 503 + Retry-After; other errors still reach the global handler", async () => {
  const { Pool } = nodeRequire("pg");
  const pool = new Pool({
    max: 1,
    connectionTimeoutMillis: 50,
    Client: FakeClient,
  });
  const held = await pool.connect(); // the only connection is busy
  const { server, base } = await startApp((app) => {
    app.get("/busy", async (req, res, next) => {
      try {
        await pool.query("SELECT 1");
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    });
    app.get("/other", (req, res, next) => next(new Error("boom")));
  });
  const errorLog = console.error;
  console.error = quiet;
  try {
    const busy = await fetch(`${base}/busy`);
    expect(busy.status).toBe(503);
    const retry = Number(busy.headers.get("retry-after"));
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(5);
    expect((await busy.json()).error).toMatch(/busy/i);

    const other = await fetch(`${base}/other`);
    expect(other.status).toBe(500);
    expect(other.headers.get("retry-after")).toBeNull();
    expect((await other.json()).error).toBe("global:boom");

    held.release();
    const free = await pool.query("SELECT 1"); // once a connection is free the same pool works again
    expect(free.rowCount).toBe(0);
  } finally {
    console.error = errorLog;
    server.close();
    await pool.end();
  }
});
