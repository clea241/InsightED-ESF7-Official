import { test, expect } from "@playwright/test";
import {
  newTenant,
  saveDraft,
  person,
  seedBrowserSession,
  openSchoolProfile,
  editProfile,
  startProfileSave,
  retryProfileSave,
  dismissSaveErrors,
} from "./helpers";

const CONFIG = "**/api/schools/curricular-config";
const html = (code: number) =>
  `<html><head><title>${code}</title></head><body><center><h1>${code} Gateway Error</h1></center><hr><center>nginx</center></body></html>`;

test.describe("gateway errors", () => {
  test("FP-05 a gateway 502/503/504 returning HTML shows a readable error, never 'Unexpected token <'", async ({
    page,
    request,
  }) => {
    const t = newTenant("fp05a");
    expect((await saveDraft(request, t, "fp05a-seed")).ok()).toBeTruthy();
    let status = 502;
    await page.route(CONFIG, (route) => {
      if (route.request().method() === "GET") return route.continue();
      return route.fulfill({
        status,
        contentType: "text/html",
        body: html(status),
      });
    });
    await seedBrowserSession(page, t);
    await openSchoolProfile(page);
    await editProfile(page);
    for (const code of [502, 503, 504]) {
      status = code;
      if (code === 502) await startProfileSave(page);
      else await retryProfileSave(page);
      await expect(page.getByText("School Profile Not Saved")).toBeVisible();
      const text =
        (await page.locator("body").innerText()) +
        (await page.getByRole("dialog").allInnerTexts()).join(" ");
      expect(text, `${code}: raw parser error leaked to the user`).not.toMatch(
        /Unexpected token|is not valid JSON|<html|<!DOCTYPE/i,
      );
      expect(text, `${code}: the user is told something readable`).toMatch(
        /Failed to save configuration/i,
      );
      await dismissSaveErrors(page);
    }
  });

  test("FP-05 5xx gateway errors are retried with growing delays, while 401 and 403 are never retried", async ({
    browser,
    request,
  }) => {
    const t = newTenant("fp05b");
    expect(
      (
        await saveDraft(request, t, "fp05b-seed", undefined, {
          personnel: [person(t, 1)],
        })
      ).ok(),
    ).toBeTruthy();
    // Every GET of the roster list, whatever its query string, is counted; what is answered is chosen per phase.
    let stamps: number[] = [];
    let answer: { status: number; type: string; body: string } | null = null; // null = pass through to the real server
    const install = async (p: import("@playwright/test").Page) =>
      p.route(/\/api\/personnel(\?.*)?$/, (route) => {
        if (route.request().method() !== "GET") return route.continue();
        stamps.push(Date.now());
        if (!answer) return route.continue();
        return route.fulfill({
          status: answer.status,
          contentType: answer.type,
          body: answer.body,
        });
      });
    // A fresh browser context per phase: a 401 logs the session out, which must not leak into the next phase.
    const visit = async (view = "roster") => {
      const p = await (await browser.newContext()).newPage();
      await install(p);
      await seedBrowserSession(p, t, view);
      await p.goto("/?view=" + view);
      return p;
    };

    // Baseline: how many list requests a healthy load makes by itself (the page may ask more than once).
    const healthy = await visit();
    await healthy.waitForLoadState("networkidle");
    const baseline = stamps.length;
    expect(baseline, "the roster must request the list").toBeGreaterThan(0);
    await healthy.context().close();

    // 403 and 401 JSON: exactly the baseline, no retries.
    for (const code of [403, 401]) {
      stamps = [];
      answer = {
        status: code,
        type: "application/json",
        body: JSON.stringify({ error: "denied" }),
      };
      const p = await visit();
      await p.waitForLoadState("networkidle");
      expect(
        stamps.length,
        `${code} must not be retried (baseline ${baseline})`,
      ).toBe(baseline);
      await p.context().close();
    }

    // 503 HTML: retried, and each wait is longer than the last. Requests made together count as one attempt (a "wave").
    const waves = () =>
      stamps.reduce<number[]>(
        (w, t0) => (w.length && t0 - w[w.length - 1] < 250 ? w : [...w, t0]),
        [],
      );
    stamps = [];
    answer = { status: 503, type: "text/html", body: html(503) };
    const failing = await visit();
    await expect
      .poll(() => waves().length, {
        timeout: 30000,
        message: "a 503 must be retried (at least 3 attempts)",
      })
      .toBeGreaterThanOrEqual(3);
    const w = waves();
    const gaps = w.slice(1).map((t0, i) => t0 - w[i]);
    expect(
      gaps[1],
      `backoff must grow: gaps ${gaps.join(", ")} ms`,
    ).toBeGreaterThan(gaps[0]);
    await expect(failing.locator("body")).not.toContainText(
      /Unexpected token|is not valid JSON/i,
    );
    await failing.context().close();
  });
});
