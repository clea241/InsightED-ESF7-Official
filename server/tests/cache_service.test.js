// Run with: node --test server/tests/cache_service.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

test("cacheService in-memory fallback works when Redis is offline", async () => {
  // Use invalid redis port so it operates in memory mode
  process.env.REDIS_HOST = "127.0.0.1";
  process.env.REDIS_PORT = "1";
  delete process.env.REDIS_URL;

  const cache = require("../services/cacheService");

  await cache.set("test:key1", { name: "Item 1" }, 2);
  const val1 = await cache.get("test:key1");
  assert.deepEqual(val1, { name: "Item 1" });

  await cache.set("test:key2", { name: "Item 2" }, 2);
  await cache.set("other:key3", { name: "Item 3" }, 2);

  // Test delPattern in-memory
  await cache.delPattern("test:*");
  assert.equal(await cache.get("test:key1"), null);
  assert.equal(await cache.get("test:key2"), null);
  assert.deepEqual(await cache.get("other:key3"), { name: "Item 3" });

  // Test single del
  await cache.del("other:key3");
  assert.equal(await cache.get("other:key3"), null);
});
