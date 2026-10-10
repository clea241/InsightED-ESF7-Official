# Hard rules (orm-optimizer)

These apply at every step. If a rule blocks the task, stop and tell the user; do not work around it.

## Never

- **Edit application code, `schema.ts`, migrations or config.** The only files this skill writes are under `docs/orm-optimizer/`.
- **Create or drop indexes, run migrations, run `ANALYZE`/`VACUUM`, or change any database object.**
- **Connect to a database that does not pass `scripts/guard-local-db.mjs`.** No override, no "just this once". Do not read `.env.production`, production credentials or any URL that is not the local test database. Do not print passwords.
- **Explain anything but SELECT.** `INSERT`, `UPDATE`, `DELETE`, DDL and multi-statement text are reported as **Not verified**. `explain-query.mjs` enforces this; do not bypass it by running EXPLAIN ANALYZE by hand.
- **Claim a query is slow from code reading alone.** Without a saved plan the evidence type is **Static only** and the wording is "may", never "is".
- **Apply fixes.** Fixes appear in the report as text.
- **Add dependencies or commit generated helper code to the repo.** Throwaway scripts (for `.toSQL()`) go in the scratchpad, not the repo.
- **Print or save row contents from payload columns.** They hold personal data. `payload-columns.mjs` reports key names and byte counts only; keep it that way and do not paste sample values into the report.
- **Judge bloat, vacuum or server settings.** Size numbers for payload columns are evidence of duplication only; bloat and configuration belong to `pg-health-assessment`.

## Always

- Run the scripts in `scripts/` as written. Do not regenerate or inline their logic.
- State the row counts of the tables involved in every plan-based finding.
- Use realistic parameters taken from existing local rows, and say which you used.
- Judge the recorded run, not the warm-up run.
- Keep the report structure from `assets/report-template.md` exactly; only the content changes.
- Cite `file:line`, pattern, evidence type, severity rank and fix text for every finding.

## Known failure modes to prevent

| Failure mode | Prevention |
|---|---|
| Calling every raw_payload column a duplicate | Verified needs 1,000+ rows and 30%+ of payload bytes under keys that have typed columns; a payload holding data with no column is Rejected |
| Reporting one payload finding per write site | One finding per table; list the write sites inside it |
| Calling a sequential scan a problem on a tiny local table | Only treat Seq Scan as a finding on tables above 10,000 rows with a selective filter (see `reference/reading-explain.md`). Otherwise Static only or Rejected |
| Judging plans on an empty or unrealistic local dataset | Read the row counts first (`index-coverage.md` lists the largest tables). If the table is empty or tiny, label Static only and say the dataset cannot support a verdict |
| Regenerating scanner logic instead of running the script | Run `scan-drizzle-queries.mjs`; if it misses something, report the gap, do not write a new scanner |
| Reporting the same N+1 pattern once per call site | Group by pattern and file (the scanner's `group` field); one finding with a list of lines |
| Treating usage statistics on a fresh DB as evidence | If `index-coverage.md` says stats are thin, unused-index and seq-scan sections are inconclusive |
| Reporting a candidate as a conclusion | Every scanner hit is a candidate until a plan or a read of the code supports it |
| Missing-index claim when the live DB already has the index | Compare with live indexes; a mismatch with `schema.ts` is drift, not a missing index |
| Assuming an app runs Drizzle queries because it has a Drizzle schema | Say how many sites are `drizzle` vs `raw-pg` in the Environment line; every finding carries its access layer |
| Ranking one-off scripts above request-path code | Default scan excludes scripts; report them only as grouped counts in the low-priority section |
