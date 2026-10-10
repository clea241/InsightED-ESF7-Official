# Regression test patterns (Playwright API tests)

Tests live in `e2e/security/*.spec.mjs` and run with `npx playwright test -c e2e/security/playwright.security.config.mjs` against the LOCAL test app (run the target guard first). They use the `request` fixture, seeded test accounts from `.env.security`, independent data and no fixed sleeps.

Rules:
- Title starts with the finding id: `SEC-007 ...`. Keep the `@open-finding` tag until the fix is merged, then remove it.
- Assert the secure behavior, so the test fails now and passes after the fix.
- Prove the test can fail for the right reason: it must use a real token for the intended tenant (assert login succeeded) and fail on an assertion, never on a connection error.

## Login helper (shared)
```js
async function login(request, idVar, pwVar) {
  const r = await request.post(process.env.LOGIN_PATH || "/api/auth/password-login", {
    data: { school_id: process.env[idVar], password: process.env[pwVar] },
  });
  expect(r.ok(), "test account login must work").toBeTruthy();
  return (await r.json()).token;
}
```

## Patterns
| Finding type | Assertion |
|---|---|
| SQLi payload on a parameter | status is not 500; body has no SQL error text; row count equals the benign request's count |
| IDOR | tenant A token requesting tenant B id returns 403 or 404 and body contains none of B's data |
| Missing auth | request without token returns 401 |
| Tenant header spoofing | tenant A token + `x-school-id: <B>` returns 403 (or ignores the header and returns only A's data) |
| Login rate limit | N rapid bad logins eventually return 429 with `Retry-After` |
| Security headers | response has `strict-transport-security`, `x-content-type-options: nosniff`, frame protection, `referrer-policy`; no `x-powered-by` |

## Complete example: IDOR
```js
import { test, expect } from "@playwright/test";

test("SEC-007 tenant A cannot read tenant B personnel @open-finding", async ({ request }) => {
  const tokenA = await login(request, "TENANT_A_SCHOOL_ID", "TENANT_A_PASSWORD");
  const own = await request.get(`/api/personnel?school_id=${process.env.TENANT_A_SCHOOL_ID}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  expect(own.status(), "A can read A (proves the token works)").toBe(200);

  const other = await request.get(`/api/personnel?school_id=${process.env.TENANT_B_SCHOOL_ID}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  expect([403, 404]).toContain(other.status());
  expect(JSON.stringify(await other.json().catch(() => ({})))).not.toContain(process.env.TENANT_B_SCHOOL_ID);
});
```
