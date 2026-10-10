# How to read an API + Drizzle codebase for data flow

Use this in step 3 (resolving `unresolved[]` and low-confidence entries) and step 5 (judgment findings). The scripts give a deterministic first picture; this file is how you check and extend it.

## Contents

1. Reading order
2. What `inventory.json` contains
3. `overrides.json` schema
4. Drizzle specifics
5. camelCase to snake_case mapping
6. Raw SQL fallback (no Drizzle at runtime)
7. Judgment-findings checklist
8. Personal data: classify and say what to do about it

## 1. Reading order

1. `inventory.meta`: parse mode (`ast` means the TypeScript compiler API located call expressions; field and SQL analysis is still textual), ORM coverage, counts.
2. `unresolved[]`: every entry needs either a correction in `overrides.json` or a one-line dismissal with a reason.
3. Routes with `confidence: low`, `mountResolved: false`, or `handler: null`.
4. Write routes whose `writes` count is 0 but whose method is `POST/PUT/PATCH/DELETE`: they either delegate (for example `router.handle(...)`), only read, or write through code the scanner did not reach. Open the handler.
5. Writes with `linked: heuristic` or `unlinked` in application code (`context: "app"`): background workers, queue consumers, or helpers.
6. `dynamic: true` writes: the column list or values were built at runtime. Read the builder and describe the real columns in `overrides.json`.

## 2. What `inventory.json` contains

`meta`, `routes`, `validators`, `tables`, `writes`, `clientCalls`, `infra`, `personalDataFields`, `unresolved`. Everything is sorted; reruns on an unchanged repo produce identical files.

- A **route** has `queries[]` (every database call reached from the handler, each with `linked`, `inLoop`, `deferred`), `metrics` (`roundTrips` excludes deferred work and `ROLLBACK`), `middleware.classes` (auth, tenant, rateLimit, validation by name), `requestFields` (`via: direct` or `helper`), `responses`, `responseBeforeCommit`, and `idempotencySignal`.
- `linked: direct` = inside the handler function; `one-hop` = in a function the handler calls; `heuristic` = reached at depth 2 or only by file proximity; `unlinked` = no route reaches it.
- `deferred: true` = runs after the response (inside `setImmediate`/`setTimeout`, or a fire-and-forget promise). It still uses the pool and the Node process, but not the request's critical path.
- A **write** has `columns[]` with `source`: `client` (comes from `req.body/query/params/headers`), `mixed` (server value with a client fallback), `server`, `literal`, or `unknown`.

## 3. `overrides.json` schema

All keys are optional. Route references are either a route `id` or the string `"METHOD /path"` as shown in `dataflow.md`.

```json
{
  "routeLinks": [
    { "route": "PUT /api/employment/:personnel_id", "delegatesTo": "POST /api/employment/:personnel_id", "note": "handler re-dispatches to the POST handler" },
    { "route": "POST /api/x", "writes": ["write:server/a.js:120:4311"], "note": "helper called through a variable" }
  ],
  "fieldMappings": [
    { "route": "POST /api/x", "clientField": "grade", "location": "body", "table": "esf7_x", "column": "grade_level", "transform": "trim", "validation": "none found" }
  ],
  "routeNotes": [ { "route": "POST /api/x", "note": "free text shown under the route" } ],
  "confidence": [ { "id": "POST /api/x", "confidence": "medium" } ],
  "dismissUnresolved": [ { "id": "unresolved:dynamic-sql:server/db/index.js:367", "reason": "wrapper that forwards the caller's SQL; not a write path" } ],
  "judgmentFindings": [
    { "severity": "high", "title": "Autosave rewrites the whole draft every 2 s", "evidence": ["client/src/services/draftSaver.js:40"], "detail": "..." }
  ]
}
```

Rules: only record what you verified by reading the cited file. Re-run `render-dataflow.mjs` after every change; do not edit `dataflow.md` by hand (the next render would overwrite it).

## 4. Drizzle specifics

- **Schema path** comes from `drizzle.config.ts` (`schema`), not from a guess. `infra.drizzleConfig` records it. Schemas may be split across files.
- **Triggers and some indexes live only in migrations.** The scanner lists `CREATE TRIGGER`, `CREATE INDEX`, `CREATE UNIQUE INDEX` found in the migrations folder under `infra.migrationObjects`. A trigger on a written table is a hidden extra write per row; flag it.
- `$inferInsert` / `$inferSelect` describe the row shape; a handler that spreads a request object into `.values(...)` writes whatever columns the object has (the scanner marks this `dynamic`).
- `relations()` is query sugar for reads; it does not create foreign keys. Real FKs are `.references()` or `foreignKey()`.
- `.returning()` adds a result set but not a second round trip.
- `.onConflictDoNothing({ target })` / `.onConflictDoUpdate({ target, set })` make an insert idempotent only if `target` matches a unique index that includes the client-supplied submission ID.
- `db.batch([...])` sends several statements in one round trip on drivers that support it (Neon HTTP, D1); on `node-postgres` it is not available, so check the driver in `infra.drizzleClients`.
- `db.transaction(async (tx) => {...})` holds one connection for the whole callback. Count the queries inside and look for awaited network calls inside the callback (long transactions).
- **Prepared statements:** `node-postgres` uses named prepared statements only when you pass a `name`; `postgres-js` prepares by default. Both matter for PgBouncer transaction pooling (see `buffering-patterns.md`).
- `drizzle-zod` (`createInsertSchema(table)`) derives validators from the table; the scanner expands it to the table's columns. Remember it validates shape, not business rules.

## 5. camelCase to snake_case mapping

Drizzle keys are camelCase (`submissionId`); the database column is the string argument (`"submission_id"`). If there is no string argument, the column name equals the key unless `casing: "snake_case"` is set in the Drizzle config or client. In raw SQL the column names are already database names. Always report both: client field, TypeScript key, database column.

## 6. Raw SQL fallback (no Drizzle at runtime)

Many repos use Drizzle only for the schema file or migrations and write through `pool.query` / `client.query` / `db.query`. The scanner then parses the SQL text: the table comes from `INSERT INTO t` / `UPDATE t` / `DELETE FROM t`, columns from the column list, and values from the `$1..$n` parameter array. Limits: SQL built by string concatenation, `${...}` placeholders, `INSERT ... SELECT`, and parameter arrays assembled with `push` are marked dynamic. Say so at the top of `dataflow.md` (the renderer does this when ORM coverage is not `full`). Transactions appear as `BEGIN` / `COMMIT` statements on a checked-out client.

## 7. Judgment-findings checklist

The renderer already reports rule-based findings (more than one query per request, writes outside a transaction, queries in loops, JSON columns, no idempotency, tenant from client, no auth middleware name, response before commit, DDL in requests, UPDATE/DELETE without WHERE, large body limits, pool sizes). Add the ones only reading can find:

| Check | What to look for |
|---|---|
| Hidden queries in middleware | Auth, tenant lookup, "last seen" updates, audit logging that run on every request. Read the middleware cited in `middleware.detail` (`file:line`). |
| N+1 patterns | A read inside a loop followed by a write per item; count rows for a typical submission. |
| Long transactions | Awaited HTTP calls, file I/O, or large JSON serialization between `BEGIN` and `COMMIT`. |
| Response before commit | `res.json` before `COMMIT`/`await`, or fire-and-forget writes after responding. |
| Delete-then-reinsert saves | A save that deletes all rows of a section and reinserts them: write amplification, bloat, and lost data if the second step fails outside a transaction. |
| JSON/JSONB payload size | Estimate the typical and largest document; whole-document rewrites on every autosave; TOAST. |
| Auto-save loops | Timers or `useEffect` that save on every change; saves that fire while a previous save is in flight; unchanged drafts that are still sent. |
| Retry without backoff or idempotency | `catch` blocks that retry immediately, retries that generate a new ID, retries on 4xx. |
| Stale-read overwrite | A refetch after save that replaces unsaved local edits; missing server version numbers. |
| Logout during a pending save | Logout, token expiry, or page unload while a save is queued; are drafts kept on the device? |
| Tenant source | Where `school_id` (or equivalent) is taken from, and any literal fallback. |
| Worker concurrency | How many consumers run, whether the queue claim is atomic (`FOR UPDATE SKIP LOCKED`, status guard), and what happens to a job that keeps failing. |

Record each as a `judgmentFindings` entry with at least one `file:line`.

## 8. Personal data

The scanner matches names only (identity, contact, financial, government-ID, credential, employment). It cannot know what is actually stored. For each class found:

- State which tables and columns hold it (names only) and whether it also appears in logs, JSON payloads, or Redis entries.
- Say what the buffer would add: a Redis stream entry or queue table row is another copy; it needs the same access control, TLS, and retention as the primary table.
- Recommend, without assuming the current state: encryption at rest and in transit (managed Redis with TLS and auth), masking in logs and error reports, a retention rule for queue rows and dead-letter entries, and no real personal data in load-test environments.
- Never print values. If a sample is needed to explain a format, use an invented value.
