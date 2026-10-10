import { test, expect } from "@playwright/test";

// Asserts the SECURE behavior: routes that the route-auth inventory found without authentication must refuse a
// request that has no token. These fail while the findings are open and pass once auth is required (or the route is
// added to security/public-routes.json AND removed from this list by the owner).
// Inventory source: security/reports/raw/route-inventory.json (server/server.js:218-222).
const OPEN = [
  ["SEC-022", "/health"],
  ["SEC-023", "/api/health/deep"],
  ["SEC-024", "/health/deep"],
  ["SEC-025", "/api/health/readiness"],
  ["SEC-026", "/health/readiness"],
];

for (const [id, path] of OPEN) {
  test(`${id} GET ${path} requires authentication @open-finding`, async ({ request }) => {
    const res = await request.get(path, { headers: {} });
    expect(res.status(), "no token must be refused").toBe(401);
  });
}
