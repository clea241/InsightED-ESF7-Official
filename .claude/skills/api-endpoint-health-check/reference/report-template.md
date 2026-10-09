# Report template

`scripts/render_report.js` produces this; use it as the checklist when summarising in chat.

1. **Summary line:** endpoints in manifest, tested, skipped, not testable, healthy, gate-only, inconclusive, failing, with warnings; findings by severity. Mode, base URL, role used.
2. **Findings**, sorted by severity, grouped by identical cause: `METHOD /path` (with the probe), expected vs actual, HTTP status, trimmed body, handler `file:line`, recommended fix.
3. **Endpoint matrix:** endpoint | auth | tables read | tables written | happy | no-auth | bad-input | writer | max ms | status.
4. **Table coverage:** per table, how many endpoints read and write it; endpoints with partial/unresolved mapping and why; runtime-vs-static mismatches; endpoints that write `school_drafts` get one cross-reference line to `draft-normalization-audit` (do not repeat that audit here).
5. **Skipped / not testable** with reasons (grouped).
6. **Not verified:** missing credentials, unreachable DB, logs not captured, DB noise, anything inferred rather than observed.
7. **Self-check:** report vs manifest count, independent count, endpoints without status or table result (all must be 0), unresolved routes.
8. **Next steps:** fixes to make and "rerun after fixes".

Saving: print the report in chat; if it is over about 100 lines also save `endpoint-health-report.md` (default `$TMP/api-endpoint-health-check/`; copy to `/mnt/user-data/outputs/` when that folder exists) and give the path.
