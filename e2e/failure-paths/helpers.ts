// Shared helpers for the failure-path tests. Local test environment only (the runner script enforces that).
// Every test creates its own tenant (school) and records through newTenant(), so tests never depend on each other.
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import crypto from "node:crypto";

const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

export const API = (process.env.APP_URL || "http://127.0.0.1:5017").replace(
  /\/$/,
  "",
);
export const SCHOOL_YEAR = "SY 26-27";
export const REDIS_CONFIGURED = Boolean(process.env.REDIS_URL);

export type Tenant = { schoolId: string; token: string; uid: string };

/** A fresh tenant (school) with a signed token. Pilot-series ids (199xxx) are accepted by the app without a users row. */
export function newTenant(tag = "t"): Tenant {
  return tenantFor(String(199000 + crypto.randomInt(0, 1000)), tag);
}

export function tenantFor(
  schoolId: string,
  tag = "t",
  expiresIn: string | number = "1h",
): Tenant {
  const uid = `pilot-${schoolId}`;
  const token = jwt.sign(
    {
      uid,
      email: `${tag}-${schoolId}@esf7.pilot`,
      role: "school",
      school_id: schoolId,
    },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn },
  );
  return { schoolId, token, uid };
}

/** Two distinct tenants. */
export function twoTenants(): [Tenant, Tenant] {
  const a = newTenant("a");
  let b = newTenant("b");
  while (b.schoolId === a.schoolId) b = newTenant("b");
  return [a, b];
}

export const bearer = (t: Tenant) => ({ Authorization: `Bearer ${t.token}` });

/** A small, valid draft body carrying a unique marker so tests can find exactly their own data. */
export function draftBody(
  t: Tenant,
  marker: string,
  baseVersion?: number,
  extra: Record<string, unknown> = {},
) {
  return {
    schoolYear: SCHOOL_YEAR,
    ...(baseVersion === undefined ? {} : { baseVersion }),
    payload: {
      schoolInfo: {
        schoolId: t.schoolId,
        schoolName: marker,
        shsCurriculumModel: marker,
        curricularOffering: ["Elementary", "JHS", "SHS"],
      },
      personnel: [],
      classSections: [],
      ...extra,
    },
  };
}

export async function saveDraft(
  request: APIRequestContext,
  t: Tenant,
  marker: string,
  baseVersion?: number,
  extra = {},
) {
  return request.put(`${API}/api/school/draft`, {
    headers: bearer(t),
    data: draftBody(t, marker, baseVersion, extra),
  });
}

export const person = (t: Tenant, i: number) => ({
  id: `PER-${t.schoolId}-${i}`,
  firstName: `Fp${i}`,
  lastName: `Last${i}`,
  type: "teaching",
  position: "Teacher I",
  positionCategory: "TEACHING",
  birthdate: "1990-01-15",
  schoolId: t.schoolId,
  workloadRows: [],
  designations: [],
  trainings: [],
});

/** Read-only database access for assertions. Every session is forced read-only, so a test can never write through it. */
let pool: any;
export async function dbQuery<T = any>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!/^\s*(select|with)\b/i.test(sql))
    throw new Error("dbQuery is read-only: SELECT/WITH only");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    options: "-c default_transaction_read_only=on",
  });
  return (await pool.query(sql, params)).rows;
}

/** Fixture writes for queue-worker tests only. Narrow on purpose: insert one job, age one job. */
let writePool: any;
const writer = () =>
  (writePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  }));
export async function insertQueueJob(
  schoolId: string,
  payload: unknown,
  status = "pending",
): Promise<number> {
  const r = await writer().query(
    "INSERT INTO esf7_submission_queue (school_id, school_year, payload, status) VALUES ($1, $2, $3, $4) RETURNING id",
    [schoolId, SCHOOL_YEAR, JSON.stringify(payload), status],
  );
  return r.rows[0].id;
}
export async function ageQueueJob(id: number, minutes: number) {
  await writer().query(
    "UPDATE esf7_submission_queue SET updated_at = NOW() - ($2 || ' minutes')::interval WHERE id = $1",
    [id, String(minutes)],
  );
}
export async function jobRow(id: number) {
  return (
    await dbQuery(
      "SELECT id, status, error_message, updated_at FROM esf7_submission_queue WHERE id = $1",
      [id],
    )
  )[0];
}

/** How many of the school's profile rows contain the marker text (the SHS curriculum column carries it). */
export async function profileRowsWithMarker(schoolId: string, marker: string) {
  return dbQuery(
    "SELECT * FROM esf7_school_profile p WHERE p.school_id::text = $1 AND p::text LIKE '%' || $2 || '%'",
    [schoolId, marker],
  );
}

/** True when the text appears anywhere in this browser's IndexedDB or localStorage (the data is kept on the device). */
export async function storedLocally(
  page: Page,
  needle: string,
): Promise<boolean> {
  return page.evaluate(async (n) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if ((localStorage.getItem(k) || "").includes(n)) return true;
    }
    // Every IndexedDB step is bounded: a database another tab is upgrading or deleting must not hang the check.
    const within = <T>(p: Promise<T>, fallback: T, ms = 3000) =>
      Promise.race([
        p,
        new Promise<T>((r) => setTimeout(() => r(fallback), ms)),
      ]);
    const dbs =
      (await within(indexedDB.databases(), [] as IDBDatabaseInfo[])) || [];
    for (const info of dbs) {
      if (!info.name) continue;
      const db = await within(
        new Promise<IDBDatabase | null>((res) => {
          const r = indexedDB.open(info.name!);
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(null);
          r.onblocked = () => res(null);
        }),
        null,
      );
      if (!db) continue;
      for (const store of Array.from(db.objectStoreNames)) {
        const rows = await within(
          new Promise<unknown[]>((res) => {
            try {
              const rq = db
                .transaction(store, "readonly")
                .objectStore(store)
                .getAll();
              rq.onsuccess = () => res(rq.result);
              rq.onerror = () => res([]);
            } catch {
              res([]);
            }
          }),
          [] as unknown[],
        );
        if (JSON.stringify(rows).includes(n)) {
          db.close();
          return true;
        }
      }
      db.close();
    }
    return false;
  }, needle);
}

/** Put a real signed session into the browser before the app loads (the login screen is not what these tests are about). */
export async function seedBrowserSession(
  page: Page,
  t: Tenant,
  view = "school",
) {
  await page.addInitScript(
    ([tok, sid, v]) => {
      if (localStorage.getItem("__fp_seeded_once")) return; // a later reload (for example after logout) must not log in again
      localStorage.setItem("token", tok);
      localStorage.setItem(
        "remembered_user",
        JSON.stringify({
          id: `pilot-${sid}`,
          school_id: sid,
          role: "school_head",
          pin: "123456",
          name: "FP School Head",
          username: `fp-${sid}`,
          email: `fp-${sid}@esf7.pilot`,
        }),
      );
      for (const k of ["school_id", "schoolId", "activeSchoolId"])
        localStorage.setItem(k, sid);
      localStorage.setItem("insighted_active_view", v);
      localStorage.setItem("__fp_seeded_once", "1");
    },
    [t.token, t.schoolId, view],
  );
}

export async function loginAgain(page: Page, t: Tenant, view = "dashboard") {
  await page.evaluate(
    ([tok, sid, v]) => {
      localStorage.setItem("token", tok);
      localStorage.setItem(
        "remembered_user",
        JSON.stringify({
          id: `pilot-${sid}`,
          school_id: sid,
          role: "school_head",
          pin: "123456",
          name: "FP School Head",
          username: `fp-${sid}`,
          email: `fp-${sid}@esf7.pilot`,
        }),
      );
      for (const k of ["school_id", "schoolId", "activeSchoolId"])
        localStorage.setItem(k, sid);
      localStorage.setItem("insighted_active_view", v);
    },
    [t.token, t.schoolId, view],
  );
  await page.goto(`/?view=${view}`);
}

export async function openSchoolProfile(page: Page) {
  await page.goto("/?view=school");
  await expect(page.getByText("School Profile & Registry")).toBeVisible();
  await expect(
    page.locator('input[name="shsCurriculumModel"]').first(),
  ).toBeVisible();
}

export const MODEL_A = "Strengthened Senior High School Curriculum (Grade 12)";
export const MODEL_B = "Standard K-12 SHS Curriculum";
export const SAVED_TOAST = /School Profile configuration saved to database/i;
export const LOGIN_SCREEN = /sign in|log in|login/i;

/** The edit under test: pick the other SHS curriculum model. */
export async function editProfile(page: Page, model = MODEL_A) {
  await page
    .locator(`input[name="shsCurriculumModel"][value="${model}"]`)
    .check();
}

/** Header Save, the typed CONFIRM step, then Confirm & Save. Returns once the confirm button was clicked (the save may still be running). */
export async function startProfileSave(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByPlaceholder("Type CONFIRM").fill("CONFIRM");
  await page.getByRole("button", { name: "Confirm & Save" }).click();
}

/**
 * A failed School Profile save shows two things: the page's own alert (button "Confirm") on top of a "Something went wrong" detail
 * dialog (button "Close"). Close both, in the order a user can reach them.
 */
export async function dismissSaveErrors(
  page: Page,
  alertTitle = "School Profile Not Saved",
) {
  if (await page.getByText(alertTitle).isVisible())
    await page.locator("button", { hasText: /^Confirm$/ }).click();
  // The "Something went wrong" detail dialog sits behind the CONFIRM step's overlay, so a real mouse click is intercepted
  // (that stacking is itself worth knowing); dispatching the click event on its Close button closes it.
  const details = page.getByRole("dialog", { name: /something went wrong/i });
  await details.waitFor({ state: "visible", timeout: 5000 }).catch(() => {}); // optional: bounded wait for an element the app may show
  if (await details.isVisible())
    await details.getByRole("button", { name: "Close" }).dispatchEvent("click");
  await expect(details).toBeHidden();
}

/** After a failed save the CONFIRM step stays open with CONFIRM typed: retry is one click. Otherwise run the whole flow. */
export async function retryProfileSave(page: Page) {
  const confirm = page.getByRole("button", { name: "Confirm & Save" });
  if (await confirm.isVisible()) await confirm.click();
  else await startProfileSave(page);
}

/** Logout from the dashboard: passcode first, then (with unsent changes) the "Unsaved Changes Exist" warning; warns: true asserts it and chooses Log Out Anyway. */
export async function logoutFromDashboard(
  page: Page,
  opts: { warns?: boolean } = {},
) {
  await page
    .getByRole("button", { name: /logout/i })
    .first()
    .click();
  const digits = page.locator('input[maxlength="1"]');
  await expect(digits.first()).toBeVisible();
  for (let i = 0; i < 6; i++) {
    const digit = String((i % 9) + 1);
    // The boxes auto-advance focus while React re-renders, so a fill can be dropped: fill each one until it holds its digit.
    await expect(async () => {
      await digits.nth(i).fill(digit);
      await expect(digits.nth(i)).toHaveValue(digit, { timeout: 1000 });
    }).toPass({ timeout: 10000 });
  }
  await page
    .getByRole("button", { name: /confirm & logout|retry save & logout/i })
    .click();
  if (opts.warns) {
    await expect(page.getByText("Unsaved Changes Exist")).toBeVisible();
    await page.getByRole("button", { name: "Log Out Anyway" }).click();
  }
}

/** Non-GET API calls the page makes, recorded as they happen. */
export function recordWrites(page: Page) {
  const calls: { method: string; path: string }[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") && r.method() !== "GET")
      calls.push({ method: r.method(), path: u.pathname });
  });
  return calls;
}

/** A promise you resolve by hand: lets a test hold a request open and release it at a chosen moment (no sleeps). */
export function gate() {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { opened, open };
}
