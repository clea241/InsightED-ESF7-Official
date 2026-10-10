# Reading an EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) plan

`explain-query.mjs` saves the raw plan as `docs/orm-optimizer/plans/<name>.json` and prints a summary. The file is an array with one object: `Plan` (a tree; children in `Plans`), `Planning Time`, `Execution Time` (ms).

## Fields to read

| Field | Meaning |
|---|---|
| `Node Type` | Operation: `Seq Scan`, `Index Scan`, `Index Only Scan`, `Bitmap Heap Scan`, `Nested Loop`, `Hash Join`, `Merge Join`, `Sort`, `Aggregate`, `Gather`, `Gather Merge`, `Limit` |
| `Plan Rows` | Planner's row estimate (per loop) |
| `Actual Rows` | Rows actually produced (per loop) |
| `Actual Loops` | Times the node ran. Total rows = `Actual Rows` x `Actual Loops` |
| `Actual Total Time` | Milliseconds per loop, including children. Total node time = this x loops |
| `Rows Removed by Filter` | Rows read then discarded. High values mean the scan reads far more than it returns |
| `Shared Hit Blocks` / `Shared Read Blocks` | 8 kB pages from cache vs from disk or OS. Read blocks are the expensive ones |
| `Temp Read/Written Blocks` | Spill to disk. Anything above 0 means a sort or hash did not fit in `work_mem` |
| `Sort Method`, `Sort Space Type` | `quicksort`/`Memory` is fine; `external merge`/`Disk` is a spill |
| `Hash Batches` | More than 1 means the hash table spilled |
| `Plan Width` | Estimated bytes per row |

## Scan types

- **Seq Scan**: reads the whole table. Fine when the table is small or when most rows are needed. A problem when the table is large and the node returns a small fraction (`Rows Removed by Filter` much larger than `Actual Rows`).
- **Index Scan / Index Only Scan**: uses an index. Good for selective filters. Not a guarantee of speed: check `Actual Loops` (inside a nested loop) and `Shared Read Blocks`.
- **Bitmap Heap Scan**: index finds many matches, then the heap is read in page order. Normal for medium selectivity.
- **Nested Loop** with a large `Actual Loops` on the inner side is the plan-level view of an N+1 inside one statement.

## When a sequential scan is fine

- Table below about 10,000 rows (the script's cutoff): the planner is right to skip an index.
- The query needs most of the table anyway (report/export queries).
- The local table is tiny because the local dataset is unrealistic. That is **not** evidence in either direction: state the row count, label the finding **Static only**, and say the dataset is too small to judge.

## Estimated vs actual rows

Compare `Plan Rows` with `Actual Rows` (x loops when comparing totals). A ratio of 10x or more on a node that feeds a join or sort means statistics are stale or the filter is correlated. Suggest `ANALYZE` of the table in text only; never run it. A big miss alone is not a finding; it is a reason to distrust the join order.

## Thresholds the report uses

A finding is **Verified** only if the saved plan shows at least one of these, and the report quotes the node, estimated vs actual rows, actual time and the plan file:

1. Seq Scan on a table of more than 10,000 rows that returns less than 5% of the rows it reads (`Actual Rows` / (`Actual Rows` + `Rows Removed by Filter`)), and node time above 20 ms.
2. Sort or hash spill to disk (`Sort Space Type: Disk`, `Hash Batches` > 1, temp blocks > 0).
3. Total execution time (recorded run) above 100 ms for a query that sits on a request path, or above 1,000 ms for anything.
4. Result rows above 10,000 with no `LIMIT`, or a `Plan Width` x `Actual Rows` payload above roughly 5 MB.
5. A nested loop whose inner side runs more than 1,000 loops with measurable time (inner `Actual Total Time` x `Actual Loops` above 20 ms).
6. For `query-in-loop`, the per-item time x the known list length exceeds 100 ms (state both numbers).

**Rejected** if the plan uses an index (or a small-table Seq Scan), runs in under 20 ms, has no spill, and returns a bounded number of rows. Say why it looked bad and what the plan shows.

Use the **recorded** run, not the warm-up. If warm-up and recorded times differ by more than 3x, the first run was cold cache; judge on the recorded run and mention the difference. Timings are local and relative; never state what production will do.

## Worked example 1: unbounded list (Verified)

Query: `SELECT * FROM esf7_workload_rows ORDER BY created_at ASC` (no WHERE, no LIMIT).

- Top node: `Gather Merge`, estimated 652,690 rows vs actual 651,940.
- Child: `Sort`, `Sort Method: external merge`, `Sort Space Type: Disk`, 151,824 kB, temp blocks written 97,754.
- Leaf: `Seq Scan` on `esf7_workload_rows` (~652,690 rows), nothing filtered.
- Execution time: warm 1,654 ms, recorded 1,443 ms.

Reading: the Seq Scan is *not* the problem (the query wants every row). The problems are the 650k-row result (threshold 4) and the disk spill (threshold 2). Verified, missing-limit; fix is pagination plus a tenant `WHERE`. Not an index issue.

## Worked example 2: looks bad, plan is fine (Rejected)

Query: `SELECT * FROM esf7_regular_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level, section_name` with real ids. The code has `select-all` and `orderby-unindexed` (no index leads with `grade_level`).

- Top node: `Sort`, estimated 577 rows vs actual 559, `Sort Method: quicksort`, memory.
- Child: `Index Scan` on `idx_regular_sections_school_sy`, estimated 577 vs actual 559 rows, 0.16 ms.
- Execution time: warm 52 ms (cold cache), recorded 2.4 ms. Shared hit 42, read 0.

Reading: the filter narrows 139,797 rows to 559 using an index, so sorting 559 rows in memory costs microseconds. The missing `grade_level` index would not help. Rejected: record it so nobody "fixes" it later.
