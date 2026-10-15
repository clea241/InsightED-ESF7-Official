# Failure-path scenario catalog

Each scenario has an ID (`FP-nn`), a title, an `Applies:` line, the setup, the failure to inject, and the assertion.
`scripts/coverage-matrix.js` reads this file: keep the `## FP-nn Title` heading and the `Applies:` line exactly in this shape.
`Applies: always` scenarios must have a test; `Applies: if <condition>` scenarios are checked against the app (see "Applicability in this app").

Every test title starts with its scenario ID, for example `test('FP-02 a failed save keeps the draft ...')`.

## Applicability in this app (checked against the code)

| Scenario | Applies here? | Why |
|---|---|---|
| FP-01 to FP-12 | yes | always |
| FP-13 | partly | `server/queue_worker.js` exists, but `startWorker()` returns immediately and `server.js` logs "worker permanently deactivated". Only the accept side (durable queue row) is testable. The crash and retry tests are skipped with that reason and must be enabled when the worker is switched on again. |
| FP-14 | yes (Redis-down half) | `ioredis` is used with a PostgreSQL fallback queue. The recovery half needs a local Redis (`REDIS_URL` in `.env.test`); without it that test is skipped and the report says so. |
| FP-15 | yes | `client/src/services/serverHealth.js` implements the lock (3 consecutive failed readiness probes). |

Where the app differs from the generic wording below, the scenario is tested against the app's real flow:

- The "save" under test in the UI is the School Profile page: header Save, type CONFIRM, Confirm & Save (`PUT /api/schools/curricular-config`). A failed save is also kept in the outbox ("Unsynced Changes" on the dashboard, with Retry All).
- The draft endpoint is `PUT/GET /api/school/draft` (versioned with `baseVersion`; 409 on conflict). It writes the normalized `esf7_*` tables and `school_drafts`.
- Tenant = school id. Tokens are signed with `JWT_SECRET` (`pilot-<schoolId>` uid, no users row needed).

## FP-01 Save shows "saved" only after server commit
Applies: always
- Setup: a school with a saved profile; open School Profile, change the SHS curriculum model.
- Inject: hold the save response (`route` waits on a gate you open by hand).
- Assert: while held, the button says "Saving...", no "saved" toast, and the database has no row with the new value. After release: toast appears and the row exists.

## FP-02 Save fails (500): draft kept, error visible, retry works
Applies: always
- Setup: as FP-01.
- Inject: answer the save with HTTP 500 JSON.
- Assert: error notice visible, no success toast, database unchanged, form still holds the edit, the edit is in IndexedDB/localStorage; after the server recovers, retry saves it and the database has it.

## FP-03 Leaving or logging out with a pending save
Applies: always
- Leave: dirty page, click Node Map, choose Save Changes. If the save fails the user must stay with the edit intact and a retry available. If the save is held, the app must not navigate until the server committed.
- Logout: after a failed save the edit survives closing the tab; logout from the dashboard shows "Unsaved Changes Exist" (the change stays on this device only); after login the Unsynced Changes queue retries it into the database.

## FP-04 Forced 401
Applies: always
- Inject: answer the save with 401.
- Assert: the user is sent to login without an error popup, the edit is kept locally, nothing is lost, and after login the queued change syncs. (A 401 is a session problem, not a server failure: it must not trip the server lock.)

## FP-05 Gateway 502/503/504 returning HTML
Applies: always
- Inject: HTML bodies (`<html>...502 Bad Gateway`) with those statuses, on a save and on a list read.
- Assert: the user sees a readable message, never `Unexpected token '<'` or raw HTML. Reads retry on 5xx with growing waits and are not retried on 401/403 (compare the number of requests with a healthy baseline load).

## FP-06 Initial load fails: auto-save blocked
Applies: always
- Setup: a school with real data (profile marker and personnel rows).
- Inject: every read of the school's data returns 500.
- Assert: no write request leaves the page, Save is not usable, and the database still holds the real data.

## FP-07 Save by id, never replace the whole array
Applies: always
- Setup: save 3 personnel.
- Assert: saving 1 personnel, or an empty list, does not delete the other 2 (or is rejected); the response's `entity_counts` states the true count; an explicit delete by id removes exactly that record.

## FP-08 Version conflict
Applies: always
- Two sessions: A saves three times (stored version 3); B saves on the old version 1.
- Assert: B is refused with 409 and the real current version (3), A's data is kept, B's data is not applied; B can resubmit on the reported version. Also: a session that loads the draft and saves on the version the load reported must not conflict with itself.

## FP-09 Slow network
Applies: always
- Inject: hold the save response.
- Assert: status shows Saving, then Saved (database row appears only after release); a `beforeunload` warning is raised while the edit is unsynced (also while the save is in flight) and not after it synced.

## FP-10 Delete needs confirmation and never follows a failed load
Applies: always
- Assert: the roster's delete button opens a confirmation, nothing is sent before Confirm, Cancel keeps the record. With every read failing, no DELETE or personnel write is sent and the database rows are unchanged.

## FP-11 Cross-tenant access
Applies: always
- Two schools. Tenant A's token asks for tenant B's data through query, header and path, and tries to write B's data through body, query and header ids.
- Assert: 403/404, no B data in any response, B's rows unchanged in the database, a client-supplied tenant id is ignored (the id comes from the token).

## FP-12 Unauthenticated access
Applies: always
- Inventory every route from `server/server.js` mounts and the controller files; request each without a token.
- Assert: 401 for every route except the explicit public allowlist (`/api/health`, `/api/auth`, `/api/room-profiling`, `/api/salary-matrix`). Forged, wrongly signed, expired and `alg: none` tokens get 401.

## FP-13 Queue worker error
Applies: if the app has a queue worker
- Setup: a queued submission.
- Assert (accept side, always testable): the row is committed before the response says accepted, and nothing is marked completed without a worker.
- Assert (worker side, when a worker runs): a failing job ends as failed and is not retried forever, a worker killed mid-job leaves the job claimable again, a job is never completed before its transaction committed.

## FP-14 Redis down
Applies: if the app uses Redis
- Redis down: `/api/health` reports `degraded` with queue mode `postgres-fallback`; readiness stays 200 (the lock must not trip); submissions are still accepted; the UI is usable.
- Redis recovery (needs a local Redis): the queue returns to Redis mode and queued work is not lost.

## FP-15 Readiness lock
Applies: if the app has a lock or maintenance modal
- Assert: one failed readiness probe, or any 4xx, never locks (a 4xx does not even start probes). Repeated failed probes show the blocking "server is having a problem" modal, which cannot be dismissed; the edit stays on the device; when readiness recovers the modal goes away and the edit can still be saved.
