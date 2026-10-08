// The production bug, as a browser test: edit, log out right away, log back in, and the edit must still be there.
// Also: slow and failing networks, a server outage (blocking modal + replay), and two tabs editing at once.
import { test, expect } from '@playwright/test';
import { createFakeServer, installFakeApi, seedSession, loginAgain, makeToken } from './fakeApi.mjs';

const NEW_MODEL = 'Strengthened Senior High School Curriculum (Grade 12)';

async function openSchoolProfile(page) {
  if (process.env.E2E_DEBUG) page.on('console', (m) => console.log(`[browser:${m.type()}]`, m.text().slice(0, 300)));
  await page.goto('/?view=school');
  await expect(page.getByText('School Profile & Registry')).toBeVisible();
}

// The edit: pick the other SHS curriculum model, then leave the page (the School Profile hands its form values to the
// app state, and so to the draft, when the user navigates away).
async function makeEdit(page, model = NEW_MODEL) {
  await page.locator(`input[name="shsCurriculumModel"][value="${model}"]`).check();
  await page.getByRole('button', { name: /back to dashboard/i }).click();
}

async function logoutViaDashboard(page) {
  await page.getByRole('button', { name: /logout/i }).first().click();
  const digits = page.locator('input[maxlength="1"]');
  await expect(digits.first()).toBeVisible();
  // The six boxes auto-advance focus while React re-renders, so a fill can be dropped. Fill each one until it holds its digit.
  for (let i = 0; i < 6; i++) {
    const digit = String((i % 9) + 1);
    await expect(async () => {
      await digits.nth(i).fill(digit);
      await expect(digits.nth(i)).toHaveValue(digit, { timeout: 1000 });
    }).toPass({ timeout: 10000 });
  }
  for (let i = 0; i < 6; i++) await expect(digits.nth(i)).toHaveValue(String((i % 9) + 1));
  await page.getByRole('button', { name: /confirm & logout|retry save & logout/i }).click();
}

const savedModel = (server) => server.draft.payload?.schoolInfo?.shsCurriculumModel;

test.describe('draft persistence', () => {
  test('edit, log out immediately, log in again: the edit is still there', async ({ page }) => {
    const server = createFakeServer();
    await installFakeApi(page, server);
    await seedSession(page);
    await openSchoolProfile(page);

    await makeEdit(page);
    await logoutViaDashboard(page); // well inside the 3.5 s auto-save debounce

    await expect(page.getByText(/sign in|log in|login/i).first()).toBeVisible();
    expect(savedModel(server)).toBe(NEW_MODEL); // logout waited for the server to confirm

    await loginAgain(page);
    await expect(page.getByText('School Profile & Registry')).toBeVisible();
    await expect(page.locator(`input[name="shsCurriculumModel"][value="${NEW_MODEL}"]`)).toBeChecked();
  });

  test('slow network: logout waits for the save instead of discarding it', async ({ page }) => {
    test.setTimeout(120000); // two 4-second saves plus a loaded CI machine
    const server = createFakeServer();
    server.putLatencyMs = 4000;
    await installFakeApi(page, server);
    await seedSession(page);
    await openSchoolProfile(page);

    await makeEdit(page);
    await logoutViaDashboard(page);
    await expect(page.getByText(/sign in|log in|login/i).first()).toBeVisible({ timeout: 90000 });
    expect(savedModel(server)).toBe(NEW_MODEL);
  });

  test('failing network: error notice appears, logout is blocked, nothing is lost, and it recovers', async ({ page }) => {
    const server = createFakeServer();
    await installFakeApi(page, server);
    await seedSession(page);
    await openSchoolProfile(page);

    server.failDraftPuts = true; // draft saves answer 504 (HTML)
    await makeEdit(page);

    await logoutViaDashboard(page);
    await expect(page.getByText(/could not be saved to the server yet/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: /log out anyway/i })).toBeVisible();
    expect(savedModel(server)).toBeUndefined(); // server has nothing; the user was NOT logged out

    server.failDraftPuts = false; // network recovers
    await page.getByRole('button', { name: /retry save & logout/i }).click();
    await expect(page.getByText(/sign in|log in|login/i).first()).toBeVisible({ timeout: 30000 });
    expect(savedModel(server)).toBe(NEW_MODEL);
  });
});

test.describe('server outage', () => {
  test('a 503 shows the blocking modal, keeps the draft, and replays it when the server is back', async ({ page }) => {
    const server = createFakeServer();
    await installFakeApi(page, server);
    await seedSession(page);
    await openSchoolProfile(page);

    server.down = true; // every API call now answers 503 (HTML), including the health check
    await makeEdit(page);

    const modal = page.getByRole('alertdialog');
    await expect(modal).toBeVisible({ timeout: 40000 });
    await expect(modal).toContainText(/server is having a problem/i);
    await expect(modal).toContainText(/work is protected/i);
    await expect(modal.getByRole('button', { name: /copy error details/i })).toBeVisible();
    await expect(modal.getByRole('button', { name: /retry now/i })).toBeVisible();

    // cannot be dismissed
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();

    // the edit is already safe on this device
    const local = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.map((d) => d.name);
    });
    expect(local.length).toBeGreaterThan(0);

    server.down = false;
    await expect(modal).toBeHidden({ timeout: 60000 });
    await expect.poll(() => savedModel(server), { timeout: 30000 }).toBe(NEW_MODEL); // replayed after recovery
  });
});

test.describe('two tabs', () => {
  test('editing the same draft from a second tab raises the conflict prompt instead of overwriting', async ({ browser }) => {
    const context = await browser.newContext();
    const server = createFakeServer();
    await installFakeApi(context, server);
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await seedSession(tabA);
    await seedSession(tabB);

    await openSchoolProfile(tabA);
    await openSchoolProfile(tabB);

    // Tab A saves first.
    await makeEdit(tabA);
    await expect.poll(() => server.draft.version, { timeout: 30000 }).toBeGreaterThan(0);
    const versionAfterA = server.draft.version;

    // Tab B still believes the old version and edits something else.
    await makeEdit(tabB, 'Standard K-12 SHS Curriculum');
    await tabB.getByRole('button', { name: /school profile/i }).first().click().catch(() => {});

    await expect(tabB.getByText(/two versions of your work found/i)).toBeVisible({ timeout: 40000 });
    expect(server.draft.version).toBeGreaterThanOrEqual(versionAfterA); // nothing was silently overwritten
    await context.close();
  });
});

test.describe('session expiry (401, e.g. JWT_SECRET rotated)', () => {
  test('edit, token invalidated, login again: the edit is kept, no server-error modal, and it syncs', async ({ page }) => {
    const server = createFakeServer();
    await installFakeApi(page, server);
    await seedSession(page);
    await openSchoolProfile(page);

    await makeEdit(page);
    server.requireToken = 'rotated.secret.token'; // the server now rejects the browser's token (before the 3.5 s auto-save)

    // The first auto-save is answered 401: the user lands on the login screen, without the blocking server modal.
    await expect(page.getByText(/sign in|log in|login/i).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/server is having a problem|we.?re having trouble|back online/i)).toHaveCount(0);
    expect(server.unauthorized).toBeGreaterThan(0);
    expect(savedModel(server)).toBeUndefined(); // nothing reached the server

    // Nothing local was deleted: the edit is in IndexedDB and the unsynced marker is still there.
    const local = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      const unsynced = Object.keys(localStorage).filter((k) => /unsynced|draft_version/i.test(k));
      return { dbCount: dbs.length, unsynced };
    });
    expect(local.dbCount).toBeGreaterThan(0);
    expect(local.unsynced.length).toBeGreaterThan(0);

    // Log in again with a fresh token: the edit is still on screen and is replayed to the server.
    const freshToken = makeToken('302261', 'fresh');
    server.requireToken = freshToken;
    await loginAgain(page, freshToken);
    await expect(page.getByText('School Profile & Registry')).toBeVisible();
    await expect(page.locator(`input[name="shsCurriculumModel"][value="${NEW_MODEL}"]`)).toBeChecked();
    await expect.poll(() => savedModel(server), { timeout: 30000 }).toBe(NEW_MODEL);
  });
});
