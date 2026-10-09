# Report template

## Summary
One paragraph: verdict (compliant / violations found) and counts by severity.

## Findings (most severe first)
For each: **[Severity] Title** - `file:line` - what the code does - evidence (snippet or query output) - impact - suggested fix (not applied).

## Coverage matrix
| Table | Exists (inventory) | Write path (file:line) | Read path (file:line) | Draft fallback? | Status |
|---|---|---|---|---|---|

One row per table in `reference/tables.md`. Status: verified / no code path / not verified.

## school_drafts reference classification
| file:line | Operation | Classification (OK, or violation + severity) |
|---|---|---|

## Rules check
| Rule (matatag-rules.md) | Server check file:line, or "client-only" |
|---|---|

## Not verified
What could not be checked and why (DB unreachable, guard refusal, code not found).

## Checks run
Scripts run with exit codes, and confirmation that nothing was modified.
