// Workload "Unlock Term" dialog. The dialog's markup had ended up in a different component from its state, so opening
// it (click a locked term) threw "showUnlockTermModal is not defined". Both unlock buttons are driven here, and the
// saved data is checked: the term opens, and "Unlock & Duplicate" copies the 1st-term timetable into the new term.
import { test, expect } from '@playwright/test';
import { createFakeServer, installFakeApi, seedSession, overloadedTeacher } from './fakeApi.mjs';

async function openWorkload(page) {
  const server = createFakeServer();
  server.roster = [overloadedTeacher];
  await installFakeApi(page, server);
  await seedSession(page);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/?view=workload');
  await expect(page.getByRole('button', { name: /3rd Term/ })).toBeVisible();
  return { server, pageErrors };
}

const termRows = (server, term) => ((server.draft.payload?.personnel || [])[0]?.workloadRows || []).filter((r) => (r.term || '1st') === term);

test.describe('Workload unlock term', () => {
  test('Unlock & Duplicate from 1st Term opens the term and copies the timetable', async ({ page }) => {
    const { server, pageErrors } = await openWorkload(page);
    await page.getByRole('button', { name: /3rd Term/ }).click();
    await expect(page.getByRole('heading', { name: /Unlock 3rd Term/ })).toBeVisible();
    await page.getByRole('button', { name: /Unlock & Duplicate from 1st Term/ }).click();
    await expect(page.getByRole('heading', { name: /Unlock 3rd Term/ })).toHaveCount(0); // dialog closed
    await expect(page.getByText(/Copied timetable setup from 1st Term to 3rd Term/)).toBeVisible();

    // Saved data: the draft now holds the copied rows under the 3rd term, identical in content to the 1st term's.
    await expect.poll(() => termRows(server, '3rd').length, { timeout: 25000 }).toBe(1);
    const [first] = termRows(server, '1st');
    const [copy] = termRows(server, '3rd');
    expect(copy.subject).toBe(first.subject);
    expect(copy.startTime).toBe(first.startTime);
    expect(copy.endTime).toBe(first.endTime);
    expect(copy.id).not.toBe(first.id);
    expect(pageErrors).toEqual([]);
  });

  test('Unlock with Blank Timetable opens the term without copying anything', async ({ page }) => {
    const { server, pageErrors } = await openWorkload(page);
    await page.getByRole('button', { name: /3rd Term/ }).click();
    await page.getByRole('button', { name: /Unlock with Blank Timetable/ }).click();
    await expect(page.getByRole('heading', { name: /Unlock 3rd Term/ })).toHaveCount(0);
    await expect(page.getByText(/3rd Term is now OPEN for encoding/)).toBeVisible();

    // The term is open: clicking it again switches to it directly (no dialog), and nothing was duplicated.
    await page.getByRole('button', { name: /2nd Term/ }).click();
    await page.getByRole('button', { name: /3rd Term/ }).click();
    await expect(page.getByRole('heading', { name: /Unlock 3rd Term/ })).toHaveCount(0);
    await page.waitForTimeout(5000); // let any auto-save run
    expect(termRows(server, '3rd')).toHaveLength(0);
    expect(pageErrors).toEqual([]);
  });

  test('Cancel closes the dialog and the term stays locked', async ({ page }) => {
    const { pageErrors } = await openWorkload(page);
    await page.getByRole('button', { name: /3rd Term/ }).click();
    await page.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(page.getByRole('heading', { name: /Unlock 3rd Term/ })).toHaveCount(0);
    await page.getByRole('button', { name: /3rd Term/ }).click();
    await expect(page.getByRole('heading', { name: /Unlock 3rd Term/ })).toBeVisible(); // still locked
    expect(pageErrors).toEqual([]);
  });
});
