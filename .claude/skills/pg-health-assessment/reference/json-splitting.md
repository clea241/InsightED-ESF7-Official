# json/jsonb splitting guide

`scripts/analyze-json.mjs` reads the thresholds from the block below. Edit the numbers here, not in the script.

```json thresholds
{
  "split": {
    "p95_bytes": 8192,
    "max_bytes": 102400,
    "keys_per_row": 50,
    "depth": 3,
    "array_p95_len": 50,
    "hot_key_share": 0.8,
    "hot_keys_min": 5,
    "churn_ratio": 0.5,
    "churn_min_updates": 1000,
    "large_avg_bytes": 2048
  },
  "watch": { "avg_bytes": 2048 },
  "toast_threshold": 2048,
  "high_severity_p95_bytes": 65536
}
```

## Verdicts

- **split** when any of: p95 size above `p95_bytes`; max above `max_bytes`; more than `keys_per_row` top-level keys in a row; nesting depth above `depth`; an array of objects whose p95 length exceeds `array_p95_len`; more than `hot_keys_min` keys present in over `hot_key_share` of rows while the column is used with JSON operators in queries; a column averaging above `large_avg_bytes` on a high-churn table (updates >= `churn_ratio` x rows and >= `churn_min_updates`); keys that look like ids of other tables; base64/binary-looking payloads (detected from key names and string-length/character-class statistics, never by printing values).
- **watch** when avg size is above the TOAST threshold, the type is `json` (not `jsonb`), or the column is used with JSON operators but has no GIN/expression index.
- **keep** otherwise.

Severity of a `split` finding: medium, or high when p95 is above `high_severity_p95_bytes` or the table is high-churn.

## When to keep jsonb

Truly schemaless data, read as a whole, rarely filtered by key, mostly under 2 KB. Examples: client preferences, third-party webhook payloads kept for audit.

## Why splitting helps

- Values above ~2 KB are compressed and moved to TOAST; reads detoast the whole value even for one key.
- Updating one key rewrites the entire value and creates a new row version: write amplification, dead tuples, more WAL.
- The planner has no per-key statistics, so filters on `col->>'k'` are estimated badly.
- No foreign keys, no type safety, no per-key constraints.

## Split patterns (SQL shown as text only; this skill never runs them)

1. **Promote hot keys to typed columns**, with generated columns as a bridge:
   `ALTER TABLE t ADD COLUMN status text GENERATED ALWAYS AS (doc->>'status') STORED;` then `CREATE INDEX CONCURRENTLY ON t (status);`
2. **Child table for arrays of objects:**
   `CREATE TABLE t_items (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, t_id bigint NOT NULL REFERENCES t(id), position int, sku text, qty int);`
   `CREATE INDEX CONCURRENTLY ON t_items (t_id);`
3. **Side table for cold large payloads** (vertical split, keeps hot rows narrow):
   `CREATE TABLE t_payload (t_id bigint PRIMARY KEY REFERENCES t(id), payload jsonb NOT NULL);`
4. **Foreign keys instead of embedded ids:** add `owner_id bigint REFERENCES owners(id)` and backfill from `doc->>'owner_id'`.
5. **json to jsonb:** `ALTER TABLE t ALTER COLUMN doc TYPE jsonb USING doc::jsonb;` (rewrites the table; plan a window).
6. **GIN with `jsonb_path_ops`** only where containment queries (`@>`) are real: `CREATE INDEX CONCURRENTLY ON t USING gin (doc jsonb_path_ops);`

## Safe expand/contract outline

1. Expand: add the new columns or table (nullable, no defaults that rewrite the table).
2. Dual write: the application writes both the old jsonb and the new structure.
3. Backfill in small batches (for example 1000 rows per transaction, with pauses), verifying counts.
4. Switch reads to the new structure behind a flag; compare results.
5. Contract: stop writing the old keys, then drop them from the jsonb or drop the column in a later release.

The skill only recommends this; it never runs migrations.
