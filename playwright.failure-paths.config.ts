import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Failure-path tests: a real backend and a local test database, started by
// .claude/skills/e2e-failure-path-tests/scripts/run-failure-paths.sh (which runs the environment guard first).
// There is deliberately no webServer block: never start the app from here, run the script instead.
// Environment comes from .env.test only (the script exports it; this file fills any gap for direct runs).
for (const l of fs.existsSync(".env.test")
  ? fs.readFileSync(".env.test", "utf8").split(/\r?\n/)
  : []) {
  const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
  if (m && !l.trim().startsWith("#")) process.env[m[1]] ??= m[2];
}

export default defineConfig({
  testDir: "./e2e/failure-paths",
  testMatch: "**/*.spec.ts",
  outputDir: "./e2e/reports/.artifacts",
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1, // tests own their tenants, but they share one app and one database
  retries: 0, // a flaky test is fixed, never retried
  reporter: [
    ["list"],
    ["json", { outputFile: "e2e/reports/failure-path-results.json" }],
  ],
  use: {
    baseURL: process.env.FRONTEND_URL || "http://127.0.0.1:4217",
    actionTimeout: 15000, // an action that cannot complete fails with its locator instead of hanging until the test timeout
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
