import { defineConfig } from "@playwright/test";
import fs from "node:fs";

// API-only security tests. Targets the LOCAL test app only (LOCAL_APP_URL in .env.security). No webServer: start the
// app against the local test database first, and run `node .claude/skills/security-testing/scripts/guard-scan-target.js --target local`.
// Run: npx playwright test -c e2e/security/playwright.security.config.mjs [--grep @open-finding]
const env = {};
try {
  for (const l of fs.readFileSync(".env.security", "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (m && !l.trim().startsWith("#")) Object.assign(env, { [m[1]]: m[2] });
  }
} catch {
  /* guard script reports a missing file */
}
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.mjs",
  timeout: 30000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: env.LOCAL_APP_URL || "http://127.0.0.1:5000" },
});
