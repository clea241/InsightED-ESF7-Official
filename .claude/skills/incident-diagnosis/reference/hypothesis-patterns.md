# Hypothesis patterns (eSF7 history)

Each class lists what to look for and what rules it out. Pick at least three, including one unrelated to your first idea. "Where" names the evidence source: **timeline** (logs), **query** (read-only SQL), **code** (repo, git log/blame), **client** (browser behaviour).

## Contents
Data written wrongly (1-3) · Sessions and identity (4-6) · Gateway and transport (7) · Queues (8-9) · Locks and timeouts (10-11) · Capacity (12-13) · Environment sharing (14) · Unclaimed change (15)

1. **Success shown before the database commit.** Look for: UI "saved" while the API errored or timed out later; 200 responses followed by a rollback or constraint error in the same second (timeline); queue accepted but job failed. Rules out: the save awaits the commit and returns after it (code).
2. **Whole-array replace instead of save by id.** Look for: a save that deletes rows then inserts the client's array; a row count falling by a round number (query: records-per-tenant, records-changed-in-window); `DELETE ... WHERE school_id` in a save path (code). Rules out: per-id upserts only.
3. **Empty or partial initial load followed by auto-save overwriting real data** (for example sections dropping from 44 to 2). Look for: a GET returning few rows or 5xx just before a PUT/POST of a small payload from the same client (timeline); small `payload_bytes` in draft-saves-in-window; a client without a "loaded successfully" guard (code). Rules out: saves blocked until a complete load.
4. **Forced 401 logout deleting local drafts.** Look for: a burst of 401s then users reporting lost unsaved work; client code clearing storage on 401 (code). Rules out: drafts kept across logout.
5. **Token or JWT_SECRET rotation causing one-time logouts.** Look for: one step increase in "invalid signature" at a restart/deploy time (timeline auth causes); env change in the deploy diff. Rules out: signature failures spread over time, or expiry failures only.
6. **Tenant or school id taken from a client header or parameter.** Look for: requests where the school in the path/header differs from the one in the login; data written under the wrong school (query: unexpected `school_id` writes); handler reads `req.headers`/`req.body` for the tenant (code). Rules out: tenant derived only from the verified token.
7. **Gateway 502/503/504 returning HTML; client fails with `Unexpected token '<'`.** Look for: 502/503/504 counts and nginx upstream errors at the same minutes as client errors (timeline). Rules out: no 5xx from nginx in the window.
8. **Queue worker retrying a failed job forever.** Look for: the same job message repeating with growing counts (timeline worker events); jobs stuck in `pending`/`failed` with old `created_at` (query: queue-backlog, queue-failures). Rules out: retries capped and failures moved aside.
9. **Redis outage with the PostgreSQL queue fallback not draining.** Look for: Redis fallback messages (timeline), then backlog in the PostgreSQL queue that does not shrink after Redis returns (query). Rules out: no fallback messages, or the backlog drains.
10. **Readiness lock firing on a single failure or a 4xx.** Look for: a lock/readiness error after one failed call or a 4xx (timeline); client code locking on any non-2xx (code). Rules out: lock requires repeated 5xx.
11. **Timeout layers that disagree** (browser, gateway, nginx, app, database). Look for: the same slow route ending at an exact round duration (slowest routes); 504 at nginx while the app finishes later. Rules out: durations spread without a ceiling.
12. **Pool exhaustion** (pool size × processes × apps vs `max_connections`). Look for: "too many connections", "timeout acquiring client" (timeline); compute the product from code/config. Rules out: headroom under max_connections and no such messages.
13. **Memory growth and restarts from `max_memory_restart`.** Look for: restart counts rising, restarts at regular intervals, memory near the limit (pm2-status snapshot, `free`). Rules out: stable restart count and uptime.
14. **Staging and production sharing Redis, stream keys or consumer groups.** Look for: staging job messages in the production worker log, or the same key prefix in both configs (code, ecosystem files). Rules out: distinct prefixes/instances.
15. **A change nobody claims.** Look for: `git log` and `git blame` on the affected path; the diff between the last good and first bad release; first error time vs release marker time. Rules out: no change to the affected path since the last good period.

## Also consider (non-code)
Disk full or log rotation gap (df, retention notes) · clock skew (vm-time) · a bulk import or migration run by hand · a client version cached in browsers.
