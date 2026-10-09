import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests only (fast, no database, no browser). Integration and e2e suites have their own commands.
export default defineConfig({
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) },
  },
  test: {
    include: [
      "client/tests/unit/**/*.test.{js,mjs}",
      "server/tests/unit/**/*.test.{js,mjs}",
    ],
    setupFiles: ["./client/tests/setup.js"],
    environment: "node",
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: [
        "client/src/services/draftSaver.js",
        "client/src/services/draftSync.js",
        "client/src/services/serverHealth.js",
        "client/src/services/draftErrorReporter.js",
        "client/src/services/api.js",
        "server/utils/redisConfig.js",
        "server/services/redisQueue.js",
      ],
      // Minimum coverage per draft / save / queue module (ratchet: raise as tests are added, never lower).
      // api.js (a thin wrapper over ~150 endpoints) and redisQueue.js (needs a live Redis, covered by the integration
      // suite) are reported but not gated here.
      thresholds: {
        "client/src/services/draftSaver.js": {
          lines: 85,
          functions: 70,
          statements: 80,
          branches: 60,
        },
        "client/src/services/draftSync.js": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 90,
        },
        "client/src/services/serverHealth.js": {
          lines: 75,
          functions: 60,
          statements: 70,
          branches: 40,
        },
        "client/src/services/draftErrorReporter.js": {
          lines: 85,
          functions: 90,
          statements: 85,
          branches: 65,
        },
        "server/utils/redisConfig.js": {
          lines: 65,
          functions: 60,
          statements: 65,
          branches: 60,
        },
      },
    },
  },
});
