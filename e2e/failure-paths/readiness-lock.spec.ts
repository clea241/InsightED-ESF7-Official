import { test, expect } from "@playwright/test";
import {
  newTenant,
  saveDraft,
  seedBrowserSession,
  openSchoolProfile,
  editProfile,
  startProfileSave,
  retryProfileSave,
  dismissSaveErrors,
  storedLocally,
  profileRowsWithMarker,
  MODEL_A,
  SAVED_TOAST,
} from "./helpers";

const CONFIG = "**/api/schools/curricular-config";
const READINESS = /\/api\/health\/readiness/;
const html503 =
  "<html><body><h1>503 Service Temporarily Unavailable</h1></body></html>";

async function seeded(request: any, tag: string) {
  const t = newTenant(tag);
  expect((await saveDraft(request, t, `${tag}-seed`)).ok()).toBeTruthy();
  return t;
}

test.describe("readiness lock", () => {
  test("FP-15 one readiness failure or a 4xx never locks the app", async ({
    page,
    request,
  }) => {
    const t = await seeded(request, "fp15a");
    let probes = 0;
    let failNext = 1;
    await page.route(READINESS, (route) => {
      probes++;
      if (failNext > 0) {
        failNext--;
        return route.fulfill({
          status: 503,
          contentType: "text/html",
          body: html503,
        });
      }
      return route.continue();
    });
    let saveStatus = 503;
    await page.route(CONFIG, (route) =>
      route.request().method() === "GET"
        ? route.continue()
        : route.fulfill({
            status: saveStatus,
            contentType: saveStatus === 503 ? "text/html" : "application/json",
            body:
              saveStatus === 503
                ? html503
                : JSON.stringify({ error: "denied" }),
          }),
    );
    await seedBrowserSession(page, t);
    await openSchoolProfile(page);
    await editProfile(page);

    // A 503 on the save is only a hint; a single failed readiness probe is not enough to lock.
    await startProfileSave(page);
    await expect
      .poll(() => probes, {
        timeout: 30000,
        message: "the failed request must start readiness probes",
      })
      .toBeGreaterThan(1);
    await expect(
      page
        .getByRole("alertdialog")
        .filter({ hasText: /server is having a problem/i }),
    ).toHaveCount(0);
    await expect(page.getByText("School Profile Not Saved")).toBeVisible(); // a normal error, not a lock
    await dismissSaveErrors(page);

    // A 403 never counts as a server failure at all.
    const before = probes;
    saveStatus = 403;
    await retryProfileSave(page);
    await expect(page.getByText("School Profile Not Saved")).toBeVisible();
    expect(probes, "a 4xx must not start readiness probes").toBe(before);
    await expect(
      page
        .getByRole("alertdialog")
        .filter({ hasText: /server is having a problem/i }),
    ).toHaveCount(0);
  });

  test("FP-15 repeated readiness failures lock the app, the edit survives, and it unlocks when the server is healthy again", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    const t = await seeded(request, "fp15b");
    let down = true;
    await page.route(READINESS, (route) =>
      down
        ? route.fulfill({
            status: 503,
            contentType: "text/html",
            body: html503,
          })
        : route.continue(),
    );
    await page.route(CONFIG, (route) =>
      route.request().method() === "GET" || !down
        ? route.continue()
        : route.fulfill({
            status: 503,
            contentType: "text/html",
            body: html503,
          }),
    );
    await seedBrowserSession(page, t);
    await openSchoolProfile(page);
    await editProfile(page);
    await startProfileSave(page);

    const modal = page
      .getByRole("alertdialog")
      .filter({ hasText: /server is having a problem/i });
    await expect(modal).toBeVisible({ timeout: 60000 });
    await page.keyboard.press("Escape");
    await expect(modal, "the lock cannot be dismissed").toBeVisible();
    await expect(page.getByText("School Profile Not Saved")).toBeVisible();
    expect(
      await storedLocally(page, MODEL_A),
      "the edit is protected on this device while locked",
    ).toBe(true);
    expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).toHaveLength(0);

    down = false;
    await expect(modal).toBeHidden({ timeout: 120000 });
    // Nothing was lost: the edit is still there and saves.
    await expect(
      page.locator(`input[name="shsCurriculumModel"][value="${MODEL_A}"]`),
    ).toBeChecked();
    await dismissSaveErrors(page);
    await retryProfileSave(page);
    await expect(page.getByText(SAVED_TOAST)).toBeVisible();
    expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).not.toHaveLength(
      0,
    );
  });
});
