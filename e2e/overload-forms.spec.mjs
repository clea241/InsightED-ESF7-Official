// Overload page saves, driven in a real browser against the fake API. Regression for the undeclared-variable bugs:
// the tardiness DTR save used showToast without reading it from the app context, so the record was saved and then the
// page threw (no confirmation, form not reset). The absence and tardiness date/range state is now declared too.
// Where the data lands: absence ranges live in app state and are persisted inside the school draft (PUT /school/draft);
// tardiness / DTR logs are additionally POSTed to /api/overload-late-undertime.
import { test, expect } from '@playwright/test';
import { createFakeServer, installFakeApi, seedSession, overloadedTeacher } from './fakeApi.mjs';

async function openOverload(page) {
  const server = createFakeServer();
  server.roster = [overloadedTeacher];
  await installFakeApi(page, server);
  await seedSession(page);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/?view=overload');
  await expect(page.getByText('Teaching Overload Pay Calculator')).toBeVisible();
  return { server, pageErrors };
}

const dayCell = (page, day) => page.getByRole('button', { name: new RegExp('^' + day + '.{0,2}(normal|tardy|leave)', 'i') }).first();
const dateOf = (rec) => String(rec.startDate || rec.start_date || rec.logDate || rec.log_date).slice(0, 10);

async function pickTeacher(page) {
  await page.getByText(/Select teacher with overload/).click();
  await page.getByText(/DELA CRUZ/i).first().click();
}

test.describe('Overload saves', () => {
  test('absence range: Confirm & Log records the chosen teacher, dates and leave type, and it reaches the saved draft', async ({ page }) => {
    const { server, pageErrors } = await openOverload(page);
    await page.getByRole('button', { name: /Proceed to Step 2/ }).click();
    await pickTeacher(page);
    await dayCell(page, 3).click();
    await dayCell(page, 5).click();
    await expect(page.getByText(/Selected Range:/)).toBeVisible();
    await page.getByRole('button', { name: /Confirm & Log Sick Leave/ }).click();
    await expect(page.getByText('No absences logged yet.')).toHaveCount(0);

    // The draft auto-save (3.5 s debounce) commits the absence to the server.
    await expect.poll(() => (server.draft.payload?.absences || []).length, { timeout: 20000 }).toBe(1);
    const saved = server.draft.payload.absences[0];
    expect(saved.personnelId).toBe(overloadedTeacher.id);
    expect(saved.leaveType).toBe('Sick Leave');
    expect(dateOf(saved)).toBe('2026-06-03');
    expect(String(saved.endDate || saved.end_date).slice(0, 10)).toBe('2026-06-05');
    expect(pageErrors).toEqual([]);
  });

  test('tardiness DTR: Save shows its confirmation, records the times, and the page does not crash', async ({ page }) => {
    const { server, pageErrors } = await openOverload(page);
    await page.getByRole('button', { name: /Proceed to Step 2/ }).click();
    await page.getByRole('button', { name: /Proceed to Step 3/ }).click();
    await pickTeacher(page);
    await dayCell(page, 3).click();
    await expect(page.getByRole('button', { name: /Save DTR & Workload Impact/ })).toBeVisible();
    await page.locator('input[type="time"]').first().fill('09:30');
    await page.getByRole('button', { name: /Save DTR & Workload Impact/ }).click();

    await expect(page.getByText(/DTR Log saved for 2026-06-03/)).toBeVisible(); // the confirmation toast (showToast)
    await expect.poll(() => server.lateUndertime.length).toBe(1);
    const posted = server.lateUndertime[0];
    expect(posted.personnelId).toBe(overloadedTeacher.id);
    expect(String(posted.timeIn || posted.time_in)).toBe('09:30');
    expect(dateOf(posted)).toBe('2026-06-03');
    await expect(page.getByRole('button', { name: /Save DTR & Workload Impact/ })).toHaveCount(0); // form reset (setSelectedTardyDate)

    await expect.poll(() => (server.draft.payload?.absences || []).length, { timeout: 20000 }).toBe(1);
    expect(String(server.draft.payload.absences[0].timeIn || server.draft.payload.absences[0].time_in)).toBe('09:30');
    expect(pageErrors).toEqual([]);
  });
});
