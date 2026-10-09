import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const { assertJwtSecret, isProduction } = nodeRequire(
  "../../utils/jwtSecret.js",
);

test("production without a JWT_SECRET throws a clear error", () => {
  assert.throws(
    () => assertJwtSecret({ NODE_ENV: "production" }),
    /JWT_SECRET is not set/,
  );
  assert.throws(
    () => assertJwtSecret({ NODE_ENV: "production", JWT_SECRET: "   " }),
    /JWT_SECRET is not set/,
  );
});

test("production with a short secret throws", () => {
  assert.throws(
    () => assertJwtSecret({ NODE_ENV: "production", JWT_SECRET: "short" }),
    /too short/,
  );
});

test("production with a long enough secret passes; development without one does not throw", () => {
  assert.doesNotThrow(() =>
    assertJwtSecret({ NODE_ENV: "production", JWT_SECRET: "x".repeat(32) }),
  );
  assert.doesNotThrow(() => assertJwtSecret({ NODE_ENV: "development" }));
  assert.equal(isProduction({ NODE_ENV: "Production" }), true);
});
