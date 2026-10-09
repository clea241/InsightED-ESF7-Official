// Regression for the lock modal firing after ONE failed requests call, and for requests being sent for the wrong school
// (placeholder/stale school id 100093 while the session school is 302261). Also: a 403 is an access error, not a server
// health problem, and must not be retried in a loop.
import { test, expect } from "@playwright/test";
import { createFakeServer, installFakeApi, seedSession } from "./fakeApi.mjs";

const modal = (page) => page.getByRole("alertdialog");

async function openDashboard(page, { extra = {} } = {}) {
  const server = createFakeServer();
  await installFakeApi(page, server);
  await seedSession(page, undefined, extra);
  await page.goto("/?view=dashboard");
  await expect(page.getByText("eSF7 Executive Dashboard")).toBeVisible();
  return server;
}

test.describe("requests refresh and the session school", () => {
  test("a stale school id in localStorage never reaches the API: every call uses the session school", async ({
    page,
  }) => {
    const server = await openDashboard(page, {
      extra: {
        activeSchoolId: "100093",
        school_id: "100093",
        schoolId: "100093",
      },
    });
    await expect
      .poll(() => server.requestCalls.length, { timeout: 20000 })
      .toBeGreaterThan(1); // initial load + first poll
    const asked = server.requestCalls.map((c) => c.schoolId);
    expect(asked.every((id) => id === "302261")).toBe(true);
    expect(asked).not.toContain("100093");
  });

  test('a single "Failed to fetch" on the requests call does not lock the app', async ({
    page,
  }) => {
    const server = createFakeServer();
    server.abortNextRequests = 1; // one network-level failure, exactly like the console error
    await installFakeApi(page, server);
    await seedSession(page);
    await page.goto("/?view=dashboard");
    await expect(page.getByText("eSF7 Executive Dashboard")).toBeVisible();
    await expect
      .poll(() => server.requestCalls.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(4000); // longer than the readiness probes need to settle
    await expect(modal(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /logout/i }).first(),
    ).toBeEnabled(); // the app is still usable
  });

  test("a 403 on the requests call is not a server error: no lock modal and no retry loop", async ({
    page,
  }) => {
    const server = createFakeServer();
    server.requestsStatus = 403;
    await installFakeApi(page, server);
    await seedSession(page);
    await page.goto("/?view=dashboard");
    await expect(page.getByText("eSF7 Executive Dashboard")).toBeVisible();
    await expect
      .poll(
        () =>
          server.requestCalls.filter((c) => c.path === "/api/requests/incoming")
            .length,
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);
    const afterFirst = server.requestCalls.filter(
      (c) => c.path === "/api/requests/incoming",
    ).length;
    await page.waitForTimeout(25000); // would be 2+ more polls at 10 s, or many more with a retry loop
    expect(
      server.requestCalls.filter((c) => c.path === "/api/requests/incoming")
        .length,
    ).toBe(afterFirst);
    await expect(modal(page)).toHaveCount(0);
  });
});

test("control: repeated readiness failures DO lock (so the assertions above are meaningful)", async ({
  page,
}) => {
  const server = createFakeServer();
  await installFakeApi(page, server);
  await seedSession(page);
  await page.goto("/?view=dashboard");
  await expect(page.getByText("eSF7 Executive Dashboard")).toBeVisible();
  server.down = true; // requests AND the readiness check fail
  await page.evaluate(() => fetch("/api/requests/incoming").catch(() => {})); // any request failing is only a hint
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 40000 });
});
