# Inferring auth and getting a token safely

Read when deciding which endpoints are protected, or when login fails.

Detect (from code, not guesses):
1. Look for a global gate: `app.use('/api', gateMiddleware)` in the entry file. Routes registered before it are public; routes under it are protected unless they match the gate's public list (config `auth.publicPrefixes`, cross-checked against the `PUBLIC_PREFIXES` array in `auth.gateFile`; a mismatch shows in the manifest as `gatePublicCheck`).
2. Route-level middleware whose name matches `auth.middlewareNames` marks that route protected.
3. Open the gate file: confirm the scheme (`Authorization: Bearer`, cookie, API key), the 401 vs 403 semantics, and role handling (admin, division and region roles may reach other schools; a school account is limited to its own school id).
4. Find the login route(s) (eSF7: `POST /api/auth/password-login`, body `{identifier, password}`, token in `token`).

Credentials:
- Only from environment variables named in `auth.loginBody` (`$HC_IDENTIFIER`, `$HC_PASSWORD`) or from the file named in `auth.credentialsEnvFile` (only those keys are read).
- Never hard-code, print or store them; never create an account; never try dev shortcut passwords seen in code.
- No credentials or a failed login: test public endpoints and the 401/403 gate only, mark protected endpoints `gate-only` / "skipped: no credentials", and put it under "Not verified".
- Roles: the report states the role and school used (decoded from the token claims, never the token). Endpoints that answer 403 to that role are "inconclusive: needs another role", not failures.
- Sample ids: `sampleParams` in config, or the first row of a parent list response (the runner harvests `id` / `<param>` from earlier GET responses).
