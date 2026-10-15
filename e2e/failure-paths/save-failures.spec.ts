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
  gate,
  profileRowsWithMarker,
  storedLocally,
  MODEL_A,
  SAVED_TOAST,
} from "./helpers";

const CONFIG = "**/api/schools/curricular-config";
const isWrite = (m: string) => m === "PUT" || m === "POST";

async function tenantWithSeededProfile(request: any, tag: string) {
  const t = newTenant(tag);
  // The school already has a saved profile that offers SHS, so the SHS curriculum choice is on the page.
  expect((await saveDraft(request, t, `${tag}-seed`)).ok()).toBeTruthy();
  return t;
}

test.describe("saves", () => {
  test("FP-01 the UI says saved only after the server committed (a held response never shows saved early)", async ({
    page,
    request,
  }) => {
    const t = await tenantWithSeededProfile(request, "fp01");
    const hold = gate();
    await page.route(CONFIG, async (route) => {
      if (!isWrite(route.request().method())) return route.continue();
      await hold.opened; // the request reached the server only when we let it through
      return route.continue();
    });
    await seedBrowserSession(page, t);
    await openSchoolProfile(page);
    await editProfile(page);
    await startProfileSave(page);

    // While the response is held: the button shows Saving..., no "saved" toast, and the database has nothing.
    await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();
    await expect(page.getByText(SAVED_TOAST)).toHaveCount(0);
    expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).toHaveLength(0);

    hold.open();
    await expect(page.getByText(SAVED_TOAST)).toBeVisible();
    expect(
      await profileRowsWithMarker(t.schoolId, MODEL_A),
      "saved toast shown, so the row must be committed",
    ).not.toHaveLength(0);
  });

  test("FP-02 a failed save (500) shows an error, keeps the edit on this device, and a retry saves it with nothing lost", async ({
    page,
    request,
  }) => {
    const t = await tenantWithSeededProfile(request, "fp02");
    let failing = true;
    let attempts = 0;
    await page.route(CONFIG, (route) => {
      if (!isWrite(route.request().method())) return route.continue();
      attempts++;
      if (!failing) return route.continue();
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

    // Error notice visible; the UI must not claim success.
    await expect(page.getByText("School Profile Not Saved")).toBeVisible();
    await expect(page.getByText(SAVED_TOAST)).toHaveCount(0);
    await dismissSaveErrors(page);
    expect(attempts, "the app must have tried to save").toBeGreaterThan(0);
    // The database has nothing yet, and the edit is kept on the device (form still holds it, local store has it).
    expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).toHaveLength(0);
    await expect(
      page.locator(`input[name="shsCurriculumModel"][value="${MODEL_A}"]`),
    ).toBeChecked();
    await expect
      .poll(() => storedLocally(page, MODEL_A), {
        message: "edit must be kept locally after a failed save",
      })
      .toBe(true);

    // The server recovers; the same edit saves.
    failing = false;
    await retryProfileSave(page);
    await expect(page.getByText(SAVED_TOAST)).toBeVisible();
    expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).not.toHaveLength(
      0,
    );
  });

  test("FP-09 on a slow network the save shows Saving then Saved, and leaving the page warns while changes are unsynced", async ({
    page,
    request,
  }) => {
    const t = await tenantWithSeededProfile(request, "fp09");
    const hold = gate();
    await page.route(CONFIG, async (route) => {
      if (!isWrite(route.request().method())) return route.continue();
      await hold.opened;
      return route.continue();
    });
    // Ask the page whether it would warn before unloading, the same question the browser asks when a tab is closed.
    const warnsBeforeUnload = () =>
      page.evaluate(() => {
        const e = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      });
    await seedBrowserSession(page, t);
    await openSchoolProfile(page);
    await editProfile(page);

    // Unsynced edit: the browser must warn before the tab closes.
    expect(
      await warnsBeforeUnload(),
      "beforeunload must warn while the edit is unsynced",
    ).toBe(true);

    await startProfileSave(page);
    await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();
    // Still unsynced while the slow save is in flight.
    expect(await warnsBeforeUnload(), "still unsynced while saving").toBe(true);

    hold.open();
    await expect(page.getByText(SAVED_TOAST)).toBeVisible();
    expect(await profileRowsWithMarker(t.schoolId, MODEL_A)).not.toHaveLength(
      0,
    );
    // Synced: closing no longer warns.
    await expect
      .poll(warnsBeforeUnload, { message: "no warning once synced" })
      .toBe(false);
  });
});
