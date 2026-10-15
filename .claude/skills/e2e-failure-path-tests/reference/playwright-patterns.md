# Playwright patterns for failure-path tests

All examples use the helpers in `e2e/failure-paths/helpers.ts`. Tests live in `e2e/failure-paths/*.spec.ts`, run with `playwright.failure-paths.config.ts` (one worker, `retries: 0`, no `webServer`; the runner script starts everything).

**Naming rule:** every test title starts with its scenario ID, for example `test('FP-02 a failed save ...')`. `scripts/coverage-matrix.js` finds tests by that prefix.

## Contents
1. Inject failures with `page.route()`
2. Hold a response open without sleeping
3. Offline and slow networks
4. Two browser contexts (conflicts)
5. Log in without the login screen
6. Check the database directly (read-only)
7. Kill and restart a worker process
8. One tenant and its own records per test
9. Wait on signals, not timeouts
10. Complete example: FP-02

## 1. Inject failures with `page.route()`

```ts
const SAVE = "**/api/schools/curricular-config";
const isWrite = (m: string) => m === "PUT" || m === "POST";

// HTTP 500 with a JSON body
await page.route(SAVE, (route) =>
  isWrite(route.request().method())
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "injected failure" }) })
    : route.continue());

// A gateway answering with HTML (what nginx returns): the UI must not show "Unexpected token <"
await page.route(SAVE, (route) =>
  route.request().method() === "GET"
    ? route.continue()
    : route.fulfill({ status: 504, contentType: "text/html", body: "<html><body><h1>504 Gateway Time-out</h1></body></html>" }));

// Connection dropped
await page.route(SAVE, (route) => route.abort("failed"));

// Fail twice, then pass through to the real server
let failures = 2;
await page.route(SAVE, (route) => (failures-- > 0 ? route.fulfill({ status: 503, contentType: "text/html", body: "<html>503</html>" }) : route.continue()));
```

Always prove the injection ran: count attempts in the handler, or assert the user-visible error. A test that never hit the injected response passes for the wrong reason.

## 2. Hold a response open without sleeping

```ts
const hold = gate();                       // helpers.ts: { opened: Promise<void>, open(): void }
await page.route(SAVE, async (route) => {
  if (!isWrite(route.request().method())) return route.continue();
  await hold.opened;                       // the request reaches the server only after open()
  return route.continue();
});
// ... start the save, assert "Saving..." is shown and the database has nothing ...
hold.open();                               // release, then assert "saved" and the row
```

## 3. Offline and slow networks

```ts
await context.setOffline(true);            // browser-level offline: fetch rejects with TypeError, window 'offline' fires
await context.setOffline(false);

// Slow server, deterministic: delay inside the handler on a signal you control (see 2), not a number of seconds.
// If a duration is the thing under test (backoff), measure real timestamps of attempts:
const stamps: number[] = [];
await page.route(/\/api\/personnel(\?.*)?$/, (route) => { stamps.push(Date.now()); return route.fulfill({ status: 503, contentType: "text/html", body: "<html>503</html>" }); });
// requests made together are one "wave"; the gaps between waves must grow (0.5 s, 1 s, 2 s ...)
```

## 4. Two browser contexts (conflicts)

```ts
const a = await browser.newContext();       // separate storage = separate session
const b = await browser.newContext();
const pageA = await a.newPage();
const pageB = await b.newPage();
// seedBrowserSession(pageA, tenant) and seedBrowserSession(pageB, tenant) log both in as the same school.
// For the server rule itself, two API clients are enough (see FP-08): save three versions with one,
// then save on the old version with the other and expect 409.
```

Use a fresh context per phase when a step ends the session (a 401 logs the browser out for every later page in that context).

## 5. Log in without the login screen

Tokens are signed with `JWT_SECRET` from `.env.test` (the app verifies them with the same secret). A pilot-series school id (`199xxx`, uid `pilot-<id>`) needs no users row.

```ts
const t = newTenant("fp02");                // { schoolId, token, uid }
await request.put(`${API}/api/school/draft`, { headers: bearer(t), data: draftBody(t, "seed") });   // API call as that tenant
await seedBrowserSession(page, t);          // token + remembered_user in localStorage before the app loads
```

To reuse a session across tests, `await context.storageState({ path })` after seeding and pass `storageState` to `browser.newContext()`. Prefer seeding per test: tests stay independent.

## 6. Check the database directly (read-only)

```ts
import { dbQuery, profileRowsWithMarker } from "./helpers";
const rows = await dbQuery("SELECT id FROM esf7_personnel_profile WHERE school_id::text = $1", [t.schoolId]);
expect(rows).toHaveLength(3);
```

`dbQuery` accepts only `SELECT`/`WITH` and opens sessions with `default_transaction_read_only=on`. It connects with `DATABASE_URL`, which the runner pins to the guarded test database. Assert in the database for anything that claims "saved" or "deleted". Fixture writes (only for queue tests) are in `insertQueueJob` / `ageQueueJob`.

## 7. Kill and restart a worker process

Only when the worker is enabled in the app (today `startWorker()` is switched off, so FP-13's crash test is skipped).

```ts
import { spawn } from "node:child_process";
const start = () => spawn(process.execPath, ["server/run_worker.js"], { env: process.env, cwd: process.env.E2E_PROJECT_ROOT, stdio: "ignore" });
let worker = start();
// wait for the job to reach 'processing' (poll the row), then:
worker.kill("SIGKILL");                     // crash, not a graceful stop
// age the claim so recovery applies: ageQueueJob(id, 2), then
worker = start();
await expect.poll(async () => (await jobRow(id)).status, { timeout: 30000 }).toBe("completed");
worker.kill();                              // always stop what the test started (try/finally)
```

`process.env` already carries the pinned database settings and the `pin-db.cjs` preload, so the child can only reach the test database. Never run `pm2 delete` or `pm2 stop all`; start and stop only the child you spawned.

## 8. One tenant and its own records per test

`newTenant()` picks a fresh school id, so a test never reads or writes another test's rows. Put a unique marker in the data (`draftBody(t, "fp02-seed")`) and search the database for that marker. Do not clean up with `DELETE`/`TRUNCATE`: the runner recreates the whole test database on every run.

## 9. Wait on signals, not timeouts

- UI: `await expect(locator).toBeVisible()`, `toBeHidden()`, `toBeEnabled()`; `await expect.poll(() => value, { timeout }).toBe(x)` for derived state (database rows, request counts).
- Network: `page.waitForResponse(...)`, `page.waitForLoadState("networkidle")` (after a load, to let all requests finish before counting them), or a request counter in the route handler.
- Absence: first wait for a positive signal that the process has run (for example "a readiness probe happened"), then assert the thing did not appear.
- Never `page.waitForTimeout(...)` and never `setTimeout` to wait for the app.
- Bound optional waits: `await el.waitFor({ state: "visible", timeout: 5000 }).catch(() => {})` for an element the app may or may not show.

## 10. Complete example: FP-02

```ts
import { test, expect } from "@playwright/test";
import {
  newTenant, saveDraft, seedBrowserSession, openSchoolProfile, editProfile, startProfileSave, retryProfileSave,
  dismissSaveErrors, profileRowsWithMarker, storedLocally, MODEL_A, SAVED_TOAST,
} from "./helpers";

test("FP-02 a failed save (500) shows an error, keeps the edit on this device, and a retry saves it with nothing lost", async ({ page, request }) => {
  const t = newTenant("fp02");
  expect((await saveDraft(request, t, "fp02-seed")).ok()).toBeTruthy();   // a school with a saved profile offering SHS

  let failing = true;
  let attempts = 0;
  await page.route("**/api/schools/curricular-config", (route) => {
    if (route.request().method() === "GET") return route.continue();
    attempts++;
    if (!failing) return route.continue();
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "injected failure" }) });
  });

  await seedBrowserSession(page, t);
  await openSchoolProfile(page);
  await editProfile(page);                  // pick the other SHS curriculum model
  await startProfileSave(page);             // Save, type CONFIRM, Confirm & Save

  await expect(page.getByText("School Profile Not Saved")).toBeVisible();     // error notice
  await expect(page.getByText(SAVED_TOAST)).toHaveCount(0);                   // no false success
  await dismissSaveErrors(page);
  expect(attempts).toBeGreaterThan(0);                                         // the injection ran

  expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).toHaveLength(0);   // the database has nothing
  await expect(page.locator(`input[name="shsCurriculumModel"][value="${MODEL_A}"]`)).toBeChecked();   // the form keeps the edit
  await expect.poll(() => storedLocally(page, MODEL_A)).toBe(true);           // and so does the device

  failing = false;                          // the server recovers
  await retryProfileSave(page);
  await expect(page.getByText(SAVED_TOAST)).toBeVisible();
  expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).not.toHaveLength(0);   // committed in the database
});
```
