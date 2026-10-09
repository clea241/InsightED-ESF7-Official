const cacheService1 = require("../services/cacheService");

async function testCrossWorker() {
  console.log("--- Testing Cross-Worker Cache Invalidation Broadcast ---");
  await new Promise((r) => setTimeout(r, 1000));

  // Populate local memory in this process
  cacheService1._getMemoryCache().set("worker:test:key1", { val: 123 });
  cacheService1._getMemoryExpiry().set("worker:test:key1", Date.now() + 60000);

  console.log(
    "Worker 1 initial in-memory cache has key:",
    cacheService1._getMemoryCache().has("worker:test:key1"),
  );

  // Simulate invalidation message received via Redis Pub/Sub from another worker
  const Redis = require("ioredis");
  const pubClient = new Redis();
  await pubClient.publish(
    "esf7:cache_invalidation",
    JSON.stringify({ action: "delPattern", pattern: "worker:test:*" }),
  );

  // Wait 300ms for pub/sub message propagation
  await new Promise((r) => setTimeout(r, 300));

  const stillHasKey = cacheService1._getMemoryCache().has("worker:test:key1");
  console.log(
    "Worker 1 in-memory cache after cross-worker invalidation broadcast has key:",
    stillHasKey,
  );

  pubClient.disconnect();

  if (stillHasKey === false) {
    console.log("✅ CROSS-WORKER IN-MEMORY CACHE INVALIDATION PASSED!");
    process.exit(0);
  } else {
    console.error(
      "❌ Failed cross-worker invalidation: local in-memory key was not purged.",
    );
    process.exit(1);
  }
}

testCrossWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
