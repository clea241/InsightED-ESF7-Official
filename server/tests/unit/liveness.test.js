import { test, expect, afterAll } from "vitest";
import { createRequire } from "node:module";
import http from "node:http";

const nodeRequire = createRequire(import.meta.url);
const express = nodeRequire("express");
const { createLivenessHandler } = nodeRequire("../../middleware/liveness.js");

const app = express();
app.get("/api/health/live", createLivenessHandler());
const server = app.listen(0, "127.0.0.1");
afterAll(() => new Promise((r) => server.close(r)));

const get = (headers = {}) =>
  new Promise((resolve, reject) => {
    server.once("listening", () => {});
    const port = server.address().port;
    http
      .get(
        { host: "127.0.0.1", port, path: "/api/health/live", headers },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () =>
            resolve({ status: res.statusCode, body: JSON.parse(body) }),
          );
        },
      )
      .on("error", reject);
  });

test("liveness answers 200 with lag, uptime, rss and instance fields", async () => {
  const { status, body } = await get();
  expect(status).toBe(200);
  expect(body.status).toBe("ok");
  for (const k of ["event_loop_lag_ms", "uptime_s", "rss_mb"]) {
    expect(typeof body[k]).toBe("number");
  }
  expect("instance" in body).toBe(true);
});

test("liveness makes no database or Redis call (modules never loaded)", () => {
  const loaded = Object.keys(nodeRequire.cache);
  expect(
    loaded.some((p) =>
      /server[\\/]db[\\/]|redisQueue|cacheService|[\\/]pg[\\/]lib/.test(p),
    ),
  ).toBe(false);
});

test("requests that came through nginx (forwarded headers) get 404", async () => {
  expect((await get({ "x-forwarded-for": "1.2.3.4" })).status).toBe(404);
  expect((await get({ "x-real-ip": "1.2.3.4" })).status).toBe(404);
});
