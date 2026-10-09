const path = require("path");
const cacheService = require("../services/cacheService");

async function testLiveCache() {
  console.log("--- Testing cacheService on Staging with Live Redis ---");

  // Wait for Redis connect
  await new Promise((r) => setTimeout(r, 1000));

  // 1. Basic Set and Get
  await cacheService.set("staging:test:1", { message: "hello world" }, 10);
  const val1 = await cacheService.get("staging:test:1");
  console.log("1. Get test key:", val1);
  if (!val1 || val1.message !== "hello world") {
    throw new Error("Failed basic get after set");
  }

  // 2. Multiple keys for SCAN-based delPattern
  await cacheService.set("staging:scan:a", { id: "a" }, 10);
  await cacheService.set("staging:scan:b", { id: "b" }, 10);
  await cacheService.set("staging:other:c", { id: "c" }, 10);

  console.log('2. Keys set. Calling delPattern("staging:scan:*")...');
  await cacheService.delPattern("staging:scan:*");

  const afterA = await cacheService.get("staging:scan:a");
  const afterB = await cacheService.get("staging:scan:b");
  const afterC = await cacheService.get("staging:other:c");

  console.log(
    "After delPattern: a =",
    afterA,
    ", b =",
    afterB,
    ", c =",
    afterC,
  );

  if (afterA !== null || afterB !== null) {
    throw new Error("Pattern keys were not deleted by SCAN delPattern");
  }
  if (!afterC || afterC.id !== "c") {
    throw new Error("Unrelated key was accidentally deleted");
  }

  // Cleanup
  await cacheService.del("staging:other:c");
  await cacheService.del("staging:test:1");

  console.log(
    "✅ LIVE CACHE SERVICE TEST PASSED: SCAN iteration and invalidation verified.",
  );
  process.exit(0);
}

testLiveCache().catch((err) => {
  console.error("❌ LIVE CACHE TEST FAILED:", err);
  process.exit(1);
});
