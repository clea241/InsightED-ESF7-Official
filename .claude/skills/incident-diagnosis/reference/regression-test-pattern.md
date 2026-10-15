# Regression test pattern

Turn the root cause into one Playwright test in `e2e/incidents/INC-<incident-id>-<short-name>.spec.ts`. It asserts the **correct** behaviour, so it fails now and passes after the fix.

- Title: `INC-<incident-id> <behavior asserted>`; tag `@open-incident` until the fix is merged (then the fix commit removes the tag).
- Local test environment only: run `node scripts/guard-incident-env.js --mode repro` first (loopback host, database name containing `test`, never `drill_`). Use seeded test accounts and synthetic data; never real data or real hosts.
- Reproduce the trigger with `page.route()` failure injection or direct API calls (`request` fixture).
- Assert on database state with a read-only helper (a `pg` client in a transaction that is rolled back, `SELECT` only), not only on the UI.
- Wait on network or UI signals (`waitForResponse`, `expect(locator)`), never fixed sleeps.
- It must fail **for the stated root cause**: read the failure output and confirm the failing assertion is the one named in the report (for example "expected 44 sections, found 2"), not a login or setup error. If setup fails, fix the setup, not the assertion.
- If the cause cannot be reproduced locally, write that in the report. Never write a test that passes or fails for another reason.
- If the project has the `e2e-failure-path-tests` skill, follow its conventions (helpers in `e2e/failure-paths/helpers.ts`, config `playwright.failure-paths.config.ts`) and, if the incident reveals a missing scenario, add a short note to the report recommending a new scenario there. Do not edit that skill's files.

Running it: the failure-path config only looks in `e2e/failure-paths`. Create a throwaway config inside the incident folder (gitignored), then run it through the failure-path runner's environment (`.env.test`, local test database):

```ts
// incident/<id>/playwright.incident.config.ts
import path from "node:path";
import base from "../../playwright.failure-paths.config";
export default { ...base, testDir: path.resolve(__dirname, "../../e2e/incidents") };
```

`npx playwright test -c incident/<id>/playwright.incident.config.ts` (start the local app the same way `e2e-failure-path-tests` does; never point it at a remote host).

## Example (empty initial load must not overwrite saved sections)

```ts
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Read-only helper: SELECT inside a transaction that is always rolled back.
async function countSections(schoolId: string, year: string): Promise<number> {
  const c = new Client({ host: process.env.DB_HOST, port: +(process.env.DB_PORT ?? 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const r = await c.query("select count(*)::int as n from esf7_class_sections where school_id = $1 and school_year = $2", [schoolId, year]);
    await c.query("ROLLBACK");
    return r.rows[0].n;
  } finally {
    await c.end();
  }
}

test("INC-20261016-1200-sections-vanish saving after an empty initial load keeps the existing sections @open-incident", async ({ page, request }) => {
  const school = process.env.TEST_SCHOOL_ID!; // synthetic school seeded by the failure-path runner
  const year = "2026-2027";
  const before = await countSections(school, year);
  expect(before).toBeGreaterThan(10); // precondition: seeded with many sections

  // Trigger: the initial load returns an empty list (failure injection), then the app auto-saves.
  await page.route("**/api/class-sections*", (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : route.continue());
  const saved = page.waitForResponse((r) => r.url().includes("/api/class-sections") && r.request().method() !== "GET");
  await page.goto("/");
  await saved.catch(() => undefined); // the fix may block the save entirely; both outcomes are acceptable

  // Correct behaviour: nothing was lost.
  expect(await countSections(school, year)).toBe(before);
});
```
