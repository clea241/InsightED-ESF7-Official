# Security checklist

Owner: **tool** = a script in this skill covers it; **manual** = test it by hand with the test accounts.

## Secrets
| Item | Owner |
|---|---|
| Secret scan of working tree and full git history | tool (gitleaks) |
| No hardcoded fallback secrets (e.g. `process.env.X \|\| "literal"`) | tool (Semgrep) + manual grep |
| Production refuses to start without JWT_SECRET | manual (start with NODE_ENV=production and no secret; expect failure). `server/utils/jwtSecret.js` enforces this |

## Static analysis and dependencies
| Item | Owner |
|---|---|
| Semgrep rulesets (auto, nodejs, typescript, react, sql-injection) | tool |
| ESLint security rules | tool (eslint-plugin-security; many false positives, always "unconfirmed") |
| npm audit with a patch SLA (critical 7 days, high 30 days, medium 90 days) | tool (npm audit) |

## Authentication and authorization
| Item | Owner |
|---|---|
| Every route authenticated except the allowlist | tool (route-auth-inventory) |
| Tenant id from the verified token or server-side lookup, never from a client header or param; 401 for a bad token, 403 for the wrong tenant | manual (send `x-school-id` / `school_id` of tenant B with tenant A token) |
| IDOR: tenant B's ids with tenant A's token | manual |
| Role checks server-side (a school account calling admin or division routes) | manual |

## SQL injection
| Item | Owner |
|---|---|
| sqlmap on endpoints in targets.json | tool |
| Parameterized queries only; no concatenation or template literals with user input | tool (Semgrep p/sql-injection) + manual review of hits |
| Whitelisted dynamic identifiers (sort column, direction) | manual |
| Least-privilege DB user at runtime (no superuser, no DDL) | manual |
| Generic client error messages (no SQL text) | manual: send `'` and read the error body |
| Payload regression tests (`' OR 1=1--`, quotes, semicolons) | manual (see regression-test-patterns.md) |

## Other web attacks
| Item | Owner |
|---|---|
| XSS: output escaping, no `dangerouslySetInnerHTML`/`innerHTML` with user data, sanitized rich text, CSP | tool (Semgrep, ZAP) + manual |
| CSRF (SameSite, tokens) where cookies are used; not applicable to bearer-token-only APIs | manual |
| Strict CORS allowlist, no wildcard with credentials (check `Origin: https://evil.example`) | manual |
| SSRF: allowlist outbound URLs, block internal ranges; test any endpoint that fetches a URL | manual |
| Command injection and path traversal (`../`) in file-name or path params | tool (Semgrep) + manual |
| File uploads: type, size, content validation, stored outside the web root, never executed | manual |
| Brute-force protection: rate limit and lockout on login, reset and token endpoints, alerts on spikes | manual (send N bad logins, expect 429) |

## Headers and disclosure
| Item | Owner |
|---|---|
| HSTS, X-Content-Type-Options, frame protection, referrer policy | tool (ZAP) + manual (`curl -I`) |
| No stack traces or version banners (`X-Powered-By`) | manual |
