// Exercises redisConfig.js through the same native CommonJS loader the server uses (require), so coverage is
// attributed to the file the app really runs. Run with: npm run test:unit
import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseRedisConfig, RedisConfigError } = require("../../utils/redisConfig.js");

test("CJS: env defaults and password handling", () => {
  const cfg = parseRedisConfig({ REDIS_PASSWORD: "pw" });
  assert.deepEqual(
    { host: cfg.host, port: cfg.port, url: cfg.url, password: cfg.password },
    { host: "127.0.0.1", port: 6379, url: null, password: "pw" },
  );
  assert.equal(cfg.display, "127.0.0.1:6379");
});

test("CJS: invalid port is a RedisConfigError naming the variable", () => {
  assert.throws(
    () => parseRedisConfig({ REDIS_PORT: "70000" }),
    (e) => e instanceof RedisConfigError && e.name === "RedisConfigError" && /REDIS_PORT/.test(e.message),
  );
  assert.throws(() => parseRedisConfig({ REDIS_PORT: "abc" }), /whole number/);
});

test("CJS: REDIS_URL variants", () => {
  const cfg = parseRedisConfig({ REDIS_URL: " redis://cache.local ", REDIS_PASSWORD: "x" });
  assert.equal(cfg.port, 6379);
  assert.equal(cfg.host, "cache.local");
  assert.ok(!cfg.display.includes("x@"));
  assert.throws(() => parseRedisConfig({ REDIS_URL: "redis://cache.local:99999" }), /REDIS_URL port/);
  assert.throws(() => parseRedisConfig({ REDIS_URL: "garbage" }), /not a valid URL/);
  assert.throws(() => parseRedisConfig({ REDIS_URL: "http://h:1" }), /redis:\/\/ or rediss:\/\//);
  assert.throws(() => parseRedisConfig({ REDIS_HOST: "a b" }), /REDIS_HOST/);
});
