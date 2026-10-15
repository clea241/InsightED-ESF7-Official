import { test, expect } from "@playwright/test";
import {
  newTenant,
  saveDraft,
  seedBrowserSession,
  openSchoolProfile,
  editProfile,
  startProfileSave,
  dismissSaveErrors,
  gate,
  loginAgain,
  logoutFromDashboard,
  profileRowsWithMarker,
  storedLocally,
  MODEL_A,
  SAVED_TOAST,
  LOGIN_SCREEN,
} from "./helpers";

const CONFIG = "**/api/schools/curricular-config";
const isWrite = (m: string) => m === "PUT" || m === "POST";
const unsavedDialog = (page: import("@playwright/test").Page) =>
  page.locator(".swal2-popup").filter({ hasText: "Unsaved Changes" });

async function seeded(request: any, tag: string) {
  const t = newTenant(tag);
  expect((await saveDraft(request, t, `${tag}-seed`)).ok()).toBeTruthy();
  return t;
}

test.describe("leaving and logging out with unsaved work", () => {
  test("FP-03 leaving with a pending save waits for the server; a failed save blocks leaving and offers a retry; nothing is lost", async ({
    page,
    request,
  }) => {
    const t = await seeded(request, "fp03a");
    let mode: "fail" | "hold" | "ok" = "fail";
    const hold = gate();
    await page.route(CONFIG, async (route) => {
      if (!isWrite(route.request().method())) return route.continue();
      if (mode === "fail")
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "injected failure" }),
        });
      if (mode === "hold") await hold.opened;
      return route.continue();
    });
    await seedBrowserSession(page, t);
    await openSchoolProfile(page);
    await editProfile(page);

    // Try to leave: the unsaved-changes dialog offers to save first. The save fails, so the user must stay, with the edit intact.
    await page.getByRole("button", { name: /^Node Map$/ }).click();
    await expect(unsavedDialog(page)).toBeVisible();
    await page
      .getByRole("button", { name: /save changes|stay & save/i })
      .click();
    await expect(
      page.getByRole("dialog", { name: /something went wrong/i }),
    ).toBeVisible(); // the failure is shown
    await page
      .getByRole("dialog", { name: /something went wrong/i })
      .getByRole("button", { name: "Close" })
      .click();
    await expect(page.getByText("School Profile & Registry")).toBeVisible(); // not navigated away
    await expect(page).not.toHaveURL(/view=nodemap/);
    expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).toHaveLength(0);
    // The edit is intact and a retry is available: Save is still enabled and the form still holds the change.
    await expect(
      page.locator(`input[name="shsCurriculumModel"][value="${MODEL_A}"]`),
    ).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();

    // Retry through the leave dialog while the response is held: leaving must wait for the commit.
    mode = "hold";
    await page.getByRole("button", { name: /^Node Map$/ }).click();
    await expect(unsavedDialog(page)).toBeVisible();
    await page
      .getByRole("button", { name: /save changes|stay & save/i })
      .click();
    await expect(page.getByText("School Profile & Registry")).toBeVisible();
    await expect(page).not.toHaveURL(/view=nodemap/);
    expect(
      await profileRowsWithMarker(t.schoolId, MODEL_A),
      "nothing committed while held",
    ).toHaveLength(0);
    hold.open();
    await expect(page).toHaveURL(/view=nodemap/);
    expect(
      await profileRowsWithMarker(t.schoolId, MODEL_A),
      "left the page only after the commit",
    ).not.toHaveLength(0);
  });

  test("FP-03 closing the tab and logging out after a failed save keeps the edit on the device, and the unsynced queue saves it after the next login", async ({
    page,
    request,
  }) => {
    const t = await seeded(request, "fp03b");
    let failing = true;
    await page.route(CONFIG, (route) => {
      if (!isWrite(route.request().method()) || !failing)
        return route.continue();
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "injected failure" }),
      });
    });
    await seedBrowserSession(page, t);
    await openSchoolProfile(page);
    await editProfile(page);
    await startProfileSave(page);
    await expect(page.getByText("School Profile Not Saved")).toBeVisible();
    await dismissSaveErrors(page);
    await page.getByRole("button", { name: "Cancel" }).click(); // close the CONFIRM step; the edit stays unsaved

    // The user closes the tab and comes back later (a full reload; "Discard Changes" would be an explicit choice to drop the edit),
    // then logs out from the dashboard.
    expect(
      await storedLocally(page, MODEL_A),
      "failed save is on the device before the tab closes",
    ).toBe(true);
    await page.goto("/?view=dashboard");
    await expect(
      page.getByRole("button", { name: /logout/i }).first(),
    ).toBeVisible();
    // The app warns that the unsent change stays on this device only; the user chooses Log Out Anyway.
    await logoutFromDashboard(page, { warns: true });
    await expect(page.getByText(LOGIN_SCREEN).first()).toBeVisible();

    // The failed save survived the logout on this device; the server never got it.
    expect(
      await storedLocally(page, MODEL_A),
      "failed save must survive logout locally",
    ).toBe(true);
    expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).toHaveLength(0);

    // Server back, user logs in again: the unsynced queue offers the retry, and it lands in the database.
    failing = false;
    await loginAgain(page, t, "dashboard");
    await page
      .getByRole("button", { name: /retry all/i })
      .first()
      .click();
    await expect
      .poll(
        async () => (await profileRowsWithMarker(t.schoolId, MODEL_A)).length,
        { timeout: 30000 },
      )
      .toBeGreaterThan(0);
  });

  test("FP-04 a forced 401 sends the user to login without an error popup, keeps the edit locally, and syncs after login", async ({
    page,
    request,
  }) => {
    const t = await seeded(request, "fp04");
    let expired = true;
    await page.route(CONFIG, (route) => {
      if (!isWrite(route.request().method()) || !expired)
        return route.continue();
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid or expired token" }),
      });
    });
    await seedBrowserSession(page, t);
    await openSchoolProfile(page);
    await editProfile(page);
    await startProfileSave(page);

    await expect(page.getByText(LOGIN_SCREEN).first()).toBeVisible();
    await expect(page.locator(".swal2-popup")).toHaveCount(0); // no error popup on a session expiry
    await expect(page.getByText(SAVED_TOAST)).toHaveCount(0);
    expect(
      await storedLocally(page, MODEL_A),
      "edit must be kept locally after a 401",
    ).toBe(true);
    expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).toHaveLength(0);

    expired = false;
    await loginAgain(page, t, "dashboard");
    await page
      .getByRole("button", { name: /retry all/i })
      .first()
      .click();
    await expect
      .poll(
        async () => (await profileRowsWithMarker(t.schoolId, MODEL_A)).length,
        { timeout: 30000 },
      )
      .toBeGreaterThan(0);
  });
});
