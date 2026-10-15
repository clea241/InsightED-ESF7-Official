import { test, expect } from "@playwright/test";
import {
  newTenant,
  saveDraft,
  person,
  seedBrowserSession,
  recordWrites,
  dbQuery,
  profileRowsWithMarker,
  MODEL_A,
} from "./helpers";

const failJson = (route: import("@playwright/test").Route) =>
  route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: "injected failure" }),
  });
const personnelRows = (schoolId: string) =>
  dbQuery("SELECT id FROM esf7_personnel_profile WHERE school_id::text = $1", [
    schoolId,
  ]);

test.describe("failed initial load and deletes", () => {
  test("FP-06 when the initial load fails, nothing is auto-saved and the real data is not overwritten", async ({
    page,
    request,
  }) => {
    const t = newTenant("fp06");
    const marker = "fp06-real-data";
    expect(
      (
        await saveDraft(request, t, marker, undefined, {
          personnel: [person(t, 1), person(t, 2)],
        })
      ).ok(),
    ).toBeTruthy();
    const writes = recordWrites(page);
    // Every read of the school's data fails.
    await page.route(
      /\/api\/(schools?|personnel|sections|class-sections|workloads)(\/|\?|$)/,
      (route) =>
        route.request().method() === "GET" ? failJson(route) : route.continue(),
    );
    await seedBrowserSession(page, t, "school");
    await page.goto("/?view=school");
    await page.waitForLoadState("networkidle");

    // Auto-save must stay blocked: no write went out, and Save cannot be used on an empty or partial state.
    expect(
      writes.filter(
        (w) =>
          w.path !== "/api/node-status" &&
          !w.path.startsWith("/api/node-status/"),
      ),
      "no writes after a failed load",
    ).toEqual([]);
    const save = page.getByRole("button", { name: "Save", exact: true });
    if (await save.count()) await expect(save).toBeDisabled();
    // Database: untouched.
    expect(await profileRowsWithMarker(t.schoolId, marker)).not.toHaveLength(0);
    expect(await personnelRows(t.schoolId)).toHaveLength(2);
  });

  test("FP-10 deleting personnel asks for confirmation first, and a failed load never triggers a delete", async ({
    page,
    request,
  }) => {
    const t = newTenant("fp10");
    expect(
      (
        await saveDraft(request, t, "fp10-seed", undefined, {
          personnel: [person(t, 1)],
        })
      ).ok(),
    ).toBeTruthy();
    const writes = recordWrites(page);
    await seedBrowserSession(page, t, "roster");
    await page.goto("/?view=roster");
    await expect(page.getByText("Last1, Fp1")).toBeVisible();

    // The delete button opens a confirmation; nothing is sent until it is confirmed, and Cancel keeps the record.
    await page.getByTitle("Delete Personnel").first().click();
    await expect(
      page.getByRole("heading", { name: "Delete Personnel?" }),
    ).toBeVisible();
    expect(
      writes.filter((w) => w.method === "DELETE"),
      "no delete before confirmation",
    ).toEqual([]);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: "Delete Personnel?" }),
    ).toBeHidden();
    await expect(page.getByText("Last1, Fp1")).toBeVisible();
    expect(
      writes.filter((w) => w.method === "DELETE"),
      "cancel must not delete",
    ).toEqual([]);
    expect(await personnelRows(t.schoolId)).toHaveLength(1);

    // A failed load (empty roster on screen) must never turn into a delete or an overwrite.
    const page2 = await page.context().newPage();
    const writes2 = recordWrites(page2);
    await page2.route(
      /\/api\/(personnel|school|schools|sections)(\/|\?|$)/,
      (route) =>
        route.request().method() === "GET" ? failJson(route) : route.continue(),
    );
    await page2.goto("/?view=roster");
    await page2.waitForLoadState("networkidle");
    expect(
      writes2.filter(
        (w) => w.method === "DELETE" || w.path.startsWith("/api/personnel"),
      ),
      "no delete or personnel write after a failed load",
    ).toEqual([]);
    expect(await personnelRows(t.schoolId)).toHaveLength(1);
  });
});
