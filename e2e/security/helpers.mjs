import { expect } from "@playwright/test";

// Token for the tenant A TEST account. Uses TENANT_A_TOKEN if provided (synthetic token for the local test app),
// otherwise logs in with the test account from .env.security. Never use a real user.
export async function tenantAToken(request) {
  if (process.env.TENANT_A_TOKEN) return process.env.TENANT_A_TOKEN;
  const r = await request.post(process.env.LOGIN_PATH || "/api/auth/password-login", {
    data: { school_id: process.env.TENANT_A_SCHOOL_ID, password: process.env.TENANT_A_PASSWORD },
  });
  expect(r.ok(), "test account login must work").toBeTruthy();
  return (await r.json()).token;
}
