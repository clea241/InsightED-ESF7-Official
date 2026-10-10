# Query anti-patterns checklist (Drizzle and raw node-postgres)

One section per pattern name the scanner emits (`pattern` field). Every scanner hit is a **candidate**. Use "How to confirm" to decide whether it can be Verified, and quote the "Typical fix" wording in the report (text only, never applied).

Every scanner hit has an `access_layer`: `drizzle` (query builder or relational API) or `raw-pg` (`pool.query` / `client.query` with SQL text). The same pattern names apply to both; see "Raw node-postgres patterns" below for how each looks and is fixed in raw SQL.

## Getting the real SQL for a query site

Plans are only valid for the SQL the app actually sends.

1. **Drizzle builders:** `.toSQL()` returns `{ sql, params }` without executing. In a throwaway script outside the repo (or in the scratchpad), import the same table objects and build the same chain, then print `.toSQL()`. Do not add the script to the repo.
2. **Relational queries (`db.query.x.findMany`):** `.toSQL()` also works on the returned query. The SQL is one large statement with lateral joins and `json_build_array`; explain that, not a hand-written equivalent.
3. **Raw SQL in the code:** copy the string, replace `$n` with real values from the local DB (`--params`).
4. **Temporary logging (local only):** `drizzle(client, { logger: true })` prints SQL and params. Use only against the local test DB, never commit it. Prefer 1-3.
5. **Parameter values:** pick them from existing rows (`select school_id from t group by 1 order by count(*) desc offset 5 limit 1`). A mid-sized tenant is more honest than the largest or an empty one. Say which you used.

If the SQL is built dynamically and the real text cannot be captured, the finding is **Static only**.

## query-in-loop (N+1)

**Definition.** A query awaited inside `for`, `while`, `.map`, `.forEach`, `.reduce` (including `Promise.all(rows.map(async ...))`). One round trip per item.

**Why it hurts.** Latency grows linearly with the list. Each query costs a network round trip plus planning; `Promise.all` hides the wait but still opens N connections' worth of work and can exhaust the pool.

**How to confirm.** A plan for a single iteration will usually be fast (an index lookup) and that is *not* a refutation: the problem is the call count. Evidence is (a) the loop's likely length (row counts from the local DB for the list being iterated) and (b) the single-call time x length. Mark **Verified** only when you ran the per-item query and can state both numbers; otherwise **Static only**. If the loop is provably tiny (a fixed list of 3 items), mark **Rejected**.

**Typical fix.** Fetch all rows in one query with `inArray(table.fk, ids)` and group in memory; or use a join; or a relational query with `with: { children: true }`. Keep the `ids` list bounded (chunk at ~1,000).

## write-in-loop (unbatched inserts/updates)

**Definition.** `insert`, `update` or `delete` executed once per item inside a loop.

**Why it hurts.** N round trips and, without a transaction, N commits (each waits for a WAL flush). Inside a transaction it is cheaper but still N statements.

**How to confirm.** Writes cannot be explained by this skill (SELECT only), so the finding is **Static only** unless a read of the same shape is measurable. State the expected row count (from the local DB or the request payload limit) and say it was not run.

**Typical fix.** One multi-row insert: `db.insert(t).values([...rows])` (chunk at a few thousand rows; Postgres allows 65,535 bind parameters per statement). For upserts add `.onConflictDoUpdate({ target, set: { col: sql\`excluded.col\` } })`. For bulk updates use `UPDATE ... FROM (VALUES ...)` via `sql`, or a single update with `inArray` when every row gets the same value. Keep the whole batch in one transaction.

## select-all

**Definition.** `db.select()` with no column list, or raw `SELECT *`.

**Why it hurts.** Reads and ships every column, including wide `jsonb`/`text` columns that are TOASTed. Prevents index-only scans and inflates response size and memory.

**How to confirm.** Explain the query and compare the top node's `Plan Width` with the width of the columns the caller actually uses. Large `Plan Width` (hundreds of bytes or more) on many rows, or high `Shared Read Blocks` / TOAST reads, makes it **Verified**. A small table or a single-row lookup by primary key is **Rejected**.

**Typical fix.** List only the needed columns: `db.select({ id: t.id, name: t.name }).from(t)`. For relational queries use `columns: { id: true, name: true }`.

## missing-limit

**Definition.** `findMany` with no `limit`, or a select with neither `where` nor `limit`, or raw SELECT with neither `WHERE` nor `LIMIT`.

**Why it hurts.** Result size grows with the table. The database sorts and ships everything; the API process holds it all in memory.

**How to confirm.** Explain it on the local DB with realistic row counts. Evidence: actual rows in the hundreds of thousands, a `Sort` with `Sort Space Type: Disk`, temp blocks written, execution time > 100 ms. If the table has few rows and cannot realistically grow (lookup table), **Rejected**. State the row count.

**Typical fix.** Paginate: `.limit(pageSize).offset(n)` for small pages, or keyset pagination (`where(gt(t.id, lastId)).orderBy(t.id).limit(pageSize)`) for deep pages. Add a `where` that scopes to the tenant (school, user). Return a count separately if needed.

## deep-with

**Definition.** Relational `with:` nested three or more levels deep.

**Why it hurts.** Drizzle builds one statement with nested lateral subqueries and JSON aggregation. Each level multiplies rows and JSON size; planner estimates degrade quickly.

**How to confirm.** Capture the SQL with `.toSQL()` and explain it. Look for nested loops with large `Actual Loops`, `Rows Removed by Filter`, row estimate errors >= 10x, and high time in the innermost node. A shallow-looking plan with small actual rows is **Rejected**.

**Typical fix.** Flatten: load each level with its own `inArray` query and assemble in memory (2-3 queries instead of one giant statement), select only needed columns at each level, and add `limit` to child collections.

## string-built-sql

**Definition.** `sql.raw(...)` with interpolation or concatenation, or a raw query whose SQL text is assembled with `${}` / `+`.

**Why it hurts.** Interpolated values bypass parameter binding: correctness and injection risk, and every distinct text is a new plan (no plan reuse, more parse work). Interpolating only identifiers or a generated `$1,$2,...` placeholder list is usually fine.

**How to confirm.** Read the call site. If values come from user input it is a real problem, but this skill reports it as **Static only** (it is not a plan finding). If only a static table name or a placeholder list is interpolated, **Rejected**.

**Typical fix.** Use Drizzle's `sql` tagged template, which binds `${value}` as a parameter, or the operators (`eq`, `inArray`). Only use `sql.identifier()` / a whitelist for identifiers.

## orderby-unindexed

**Definition.** `ORDER BY` on a column that no index in `schema.ts` leads with.

**Why it hurts.** Postgres must read and sort all matching rows instead of walking an index. Cost grows with the filtered row count; with `LIMIT` the missing index forces a top-N sort of everything.

**How to confirm.** Explain the query. Evidence: a `Sort` node above a scan, `Rows Removed by Filter` high, `Sort Method: external merge` (disk) or large `Sort Space Used`. If the `WHERE` already narrows to tens of rows via another index, the sort is trivial: **Rejected**. Also check `index-coverage.mjs`: the live DB may have an index `schema.ts` does not declare (drift), in which case there is no problem, only a schema file out of date.

**Typical fix.** Add an index that matches the filter then the sort: `index().on(t.schoolId, t.createdAt)`. Equality columns first, then the order-by column, in the same direction as the query. Only suggest it; never create it.

## pool-no-max

**Definition.** `new Pool(...)` / `postgres(...)` with no explicit `max`.

**Why it hurts.** The default (10 for node-postgres, 10 for postgres-js) may be too high or too low for the app's concurrency and for Postgres `max_connections`, especially with several app processes (PM2 cluster x pool size).

**How to confirm.** Static only (a configuration finding, not a plan). Record the number of app processes if visible in the repo (for example PM2 `instances`) and compute `instances x max` versus `max_connections` read from the local DB.

**Typical fix.** Set `max` explicitly and size it: `processes x max` well below `max_connections`, leaving headroom for migrations and admin tools. Set `idleTimeoutMillis` and `connectionTimeoutMillis`. Without a pooler a common start is 5-10 per process.

## prepared-with-pooler

**Definition.** Prepared statements enabled (postgres-js default `prepare: true`, or named queries in node-postgres) while a transaction-mode pooler such as PgBouncer is configured.

**Why it hurts.** In transaction pooling, consecutive statements can land on different server connections, so a prepared statement made on one connection is missing on the next. Symptoms are intermittent `prepared statement "..." does not exist` errors.

**How to confirm.** Static only. Evidence is a pooler hint (port 6432, `pgbouncer`, `pooler` in connection settings or example env) plus `prepare` not set to `false`, or `name:` on queries.

**Typical fix.** postgres-js: `postgres(url, { prepare: false })`. node-postgres: remove the `name` property from query configs. Or run PgBouncer 1.21+ with `max_prepared_statements` set.

## Composite index order (used in fix wording)

For `WHERE a = ? AND b > ? ORDER BY c`, put equality columns first, then the range column, then the sort column only if the range column is not the sort. An index on `(b, a)` does not serve a filter on `a` alone. A leading-column prefix serves its prefix queries, so `(a, b)` makes a separate `(a)` index redundant.

## duplicated-json-payload and payload-write-whole-body

**Definition.** A table has a payload-style JSON/JSONB column (`raw_payload`, `payload`, `payload_json`, `raw_data`, `body`, `*_data`, `*_json`) and the write code puts the whole request body (or `{ ...row, extra }`) into it with `JSON.stringify(req.body)`, while the same fields are also written to typed columns in the same statement. `duplicated-json-payload` is the schema column (file:line in `schema.ts`); `payload-write-whole-body` is each write site. Report them as one ranked finding per table with the write sites listed.

**Why it hurts.** Every insert and update writes the data twice: typed columns plus the JSON copy (heap, TOAST above ~2 kB, WAL, replicas, backups). The copy can silently disagree with the typed columns, and reads that touch the payload pay to detoast it. Wide rows also make updates rewrite more bytes.

**How to confirm (`payload-columns.mjs`, read-only, local DB).** Average and max `pg_column_size` of the column vs the rest of the row; heap vs TOAST vs total size; share of payload bytes whose top-level key has a same-named typed column (snake_case of the key); EXPLAIN (ANALYZE, BUFFERS) of reading the column vs a baseline scan of the same rows (the write cost is estimated from the average payload bytes, since writes are never run). Verified: 1,000+ rows and 30%+ of payload bytes duplicated. Rejected: the payload mostly holds data with no column. Static only: too few rows locally.

**Typical fix (text only).** Store only the typed columns. Where a payload is genuinely needed (fields without a column, or an audit copy), keep it but trim it to those fields: build the object from the keys that have no column instead of passing `req.body`. Move repeated structures that are really child records into child tables. Backfill and column drops need a reviewed migration, never run by this skill. Do not decide on bloat or vacuum here; refer to `pg-health-assessment`.

Never print or save payload contents in the report: they usually hold personal data. Key names and byte counts are enough.

## Raw node-postgres patterns

For `access_layer: raw-pg` the SQL is visible in the code: copy the string, replace `$n` with real values from local rows, and pass them via `--params`. If the string is assembled at runtime, log it once on the local DB, or label the finding Static only.

| Pattern | What it looks like in raw pg | Fix wording |
|---|---|---|
| query-in-loop | `for (const id of ids) { await client.query("SELECT ... WHERE id = $1", [id]) }` | One query with `WHERE id = ANY($1::text[])`, pass the array, group in memory |
| write-in-loop (per-row insert) | `await client.query("INSERT ... VALUES ($1,$2)")` per row | One statement: `INSERT ... SELECT * FROM unnest($1::text[], $2::int[])`, or a multi-row VALUES list chunked below 65,535 parameters; one transaction |
| select-all | `SELECT * FROM t` | List the needed columns; leave out wide `jsonb` columns such as `raw_payload` |
| missing-limit | `SELECT ... FROM t` with no WHERE or LIMIT | Add the tenant WHERE and `LIMIT $n OFFSET $m`, or keyset pagination |
| string-built-sql | `client.query(` + template literal with `${id}` inside the SQL, or `+` concatenation | Use `$1` placeholders and a values array. Interpolating only a whitelisted identifier or a generated `$1,$2,...` list is acceptable (Rejected) |
| unparameterized values | Same as above; literals pasted into SQL that change per call also defeat plan reuse | Bind every value; report as Static only (correctness/security, not a plan finding) |
| pool size (pool-no-max) | `new Pool({ connectionString })` without `max`; spread configs that hide it | Set `max` explicitly; processes x `max` below `max_connections`; set `idleTimeoutMillis` and `connectionTimeoutMillis` |
| prepared-with-pooler | `client.query({ name: "x", text })` behind PgBouncer in transaction mode | Remove `name`, or use a PgBouncer version with prepared statement support |
| orderby-unindexed | `ORDER BY created_at` where no index leads with it | Index matching the filter then the sort, e.g. `(school_id, created_at)`; only after the plan shows real sort cost |

Functions on columns in raw SQL (`UPPER(col) = $1`, `COALESCE(term,'1st') = $2`, `col::text`) can stop an index being used. Always check the plan: when another indexed column narrows the rows first (for example `personnel_id = $1`), the function is harmless.

## Patterns the scanner does not detect

Missing transactions around multi-statement writes, functions on indexed columns (`UPPER(col) = $1`, `col::text`, `date(col)`), `OR` across different columns, `OFFSET` pagination on large offsets, `LIKE '%x%'`, count-then-fetch double queries. If you see one while reading a site, report it under the nearest pattern name and say it was found by reading. Functions on indexed columns are the most common reason an index exists but the plan still shows a Seq Scan; verify with `explain-query.mjs`.
