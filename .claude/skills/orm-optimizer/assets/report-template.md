# ORM Optimizer Report - <YYYY-MM-DD>

**Scope:** <paths or modules analysed>  |  **Mode:** read-only analysis; no application code, schema, migration or config was changed.

## Environment

`Database: <name> @ <host>  |  Largest tables (live rows): <table=rows, ...>  |  Stats reset: <date or unknown>  |  Date: <YYYY-MM-DD>  |  Scanner: <files scanned, candidate sites, groups>`

State here whether the local dataset is realistic for the tables involved. If a table in a finding is tiny, say so; that finding cannot be Verified.

## Summary

| Severity | Verified | Static only | Total |
|---|---|---|---|
| High | | | |
| Medium | | | |
| Low | | | |
| **Total ranked findings** | | | |

**Rejected:** <n> (listed in the Rejected section, not ranked).  **Not verified items:** <n>.

<Two or three sentences: what matters most and the single biggest win. Counts must match the findings table.>

## Ranked findings

Ranked findings come from `app` tier code first. Rank by: impact on request-path (hot) code first, then table size, then frequency. Group repeated occurrences of one pattern in one file into one row and list the lines.

| Rank | Severity | Pattern | Access layer | file:line | Evidence | Plan file | Suggested fix (text only) |
|---|---|---|---|---|---|---|---|
| 1 | | | drizzle / raw-pg | | Verified / Static only | `docs/orm-optimizer/plans/<name>.json` or n/a | |

## Finding details

### 1. <pattern> - `<file:line>` (<Severity>, <Evidence>, access layer: <drizzle | raw-pg>)

- **What the code does:** <one or two sentences, plain language>
- **Payload evidence (duplicated-json-payload only):** avg / max column bytes, rest-of-row bytes, heap/TOAST sizes, key overlap, plan file for the read comparison; write cost is estimated from payload bytes, not timed.
- **Plan evidence (Verified only):** node `<Node Type>`; estimated rows <n> vs actual <n> (loops <n>); actual time <ms> recorded / <ms> warm; spills / buffers <...>; plan file `docs/orm-optimizer/plans/<name>.json`
- **Why it matters:** <impact on a real request or table size>
- **Suggested fix (not applied):** <text from reference/drizzle-antipatterns.md, adapted to this code>
- **Other sites in this group:** <file:line, file:line>

## Low priority: one-off scripts

Tier `script` hits (scripts, scratch, seed, migration and backfill code). Show grouped counts only, not individual findings, unless the scan used `--include-scripts`.

| Location | Hits | Main patterns |
|---|---|---|
| <folder or "top-level script files"> | <n> | <pattern: n, ...> |

Excluded script hits: <n> (from `candidates.md`). If `--include-scripts` was used, say "scripts included" and list them by group.

## Duplicated JSON payloads

Source: `docs/orm-optimizer/plans/payload-columns.md`. One row per table (also ranked above when High or Medium).

| Table.column | Verdict | Rows | Avg / max column bytes | Payload % of row | Heap / TOAST MB | Typed-column overlap | Write sites (file:line, access layer) | Plan file |
|---|---|---|---|---|---|---|---|---|

Note any payload that is wide but mostly holds non-column data (Rejected) and tables with too few local rows (Static only).

## Index coverage

Source: `docs/orm-optimizer/plans/index-coverage.md`

- **Missing-index candidates:** <table.column used at file:line, live rows, priority>
- **Unused indexes:** <list, or "inconclusive: stats are thin">
- **Duplicate or redundant indexes:** <list>
- **Declared vs live drift:** <schema.ts vs database differences>
- **High sequential scan tables:** <list or inconclusive>

## Rejected (looked bad, plan is fine)

| file:line | Pattern | Why it looked bad | What the plan shows | Plan file |
|---|---|---|---|---|

## Not verified

Everything that was flagged but could not be run, with the reason (write statement, dynamic SQL that could not be captured, no realistic local data, query needs auth context, configuration-only finding).

| file:line | Pattern | Reason not verified |
|---|---|---|

## Method and checks

<Short list: which scripts were run, which queries were explained and with which parameter values, which acceptance checks passed, anything that could not be checked.>
