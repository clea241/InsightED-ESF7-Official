import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { tenantAToken } from "./helpers.mjs";

// Semgrep flagged server/controllers/reports/index.js:441-452 (path.join + res.sendFile with a URL parameter).
// Secure behavior: an encoded "../" in :filename must not reach files outside server/scratch.
// server/package.json exists one level above server/scratch, so a 200 proves the traversal.
test("SEC-571 report download rejects encoded ../ in filename", async ({ request }) => {
  const token = await tenantAToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const ctl = await request.get("/api/reports/download-overload-pay/does-not-exist.xlsx", { headers });
  expect(ctl.status(), "control: authenticated, unknown file is 404 (proves the token works)").toBe(404);

  const res = await request.get("/api/reports/download-overload-pay/..%2Fpackage.json", { headers });
  expect([400, 403, 404]).toContain(res.status());
  expect(await res.text()).not.toContain('"dependencies"');
});

for (const bad of ["..%5Cpackage.json", "..%2F..%2F.env", "%2e%2e%2fpackage.json", "x.xlsx%00.png", "package.json"]) {
  test(`SEC-571 report download refuses ${bad}`, async ({ request }) => {
    const token = await tenantAToken(request);
    const res = await request.get(`/api/reports/download-overload-pay/${bad}`, { headers: { Authorization: `Bearer ${token}` } });
    expect([400, 404]).toContain(res.status());
    expect(await res.text()).not.toContain('"dependencies"');
  });
}

test("SEC-571 a legitimate report file still downloads intact", async ({ request }) => {
  const token = await tenantAToken(request);
  const name = `Security_Test_${Date.now()}.xlsx`;
  const file = path.resolve("server/scratch", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "PK-fake-xlsx-content");
  try {
    const res = await request.get(`/api/reports/download-overload-pay/${name}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe("PK-fake-xlsx-content");
  } finally {
    fs.rmSync(file, { force: true });
  }
});
