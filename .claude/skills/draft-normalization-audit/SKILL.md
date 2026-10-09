---
name: draft-normalization-audit
description: Read-only audit of whether the eSF7 backend persists school data in the normalized esf7_* tables instead of as one JSON payload in school_drafts. Use when asked to audit, verify or check backend persistence, "is data saved in the right tables", JSON payload storage, normalization, save/load behavior, or school_drafts; and whenever save, submit, load, autosave or Draft Sync code (school/draft routes, /api/workloads/bulk, section and personnel saves) is changed. Never writes to the database or code unless the user asks for a fix afterwards.
---

# Draft Normalization Audit

**Mode: read-only.** Report findings; do not edit code, run `--apply`, or write to any DB unless the user explicitly asks for a fix afterwards. Hard rules and severities: read `rules.md` first (short, always).

**Principle:** `school_drafts` holds only transient in-progress state plus legacy rows awaiting migration. It must never be the source of truth for committed data. Committed data lives in the normalized `esf7_*` tables.

## Pipeline

1. **Inventory the schema (run the script, do not retype SQL).**
   `node .claude/skills/draft-normalization-audit/scripts/run_inventory.js` runs `scripts/inventory_tables.sql` behind a guard (loopback host, `esf7_local` / `insighted_esf7` only, SELECT only). Table list and the intentional `esf7_perssonel_educ` spelling: read `reference/tables.md` when mapping fields to tables.
2. **Find references (run the script).**
   `bash .claude/skills/draft-normalization-audit/scripts/scan_references.sh` greps `server/` and `client/src/` for `school_drafts`, draft routes, `esf7_room_roster_cache`, payload reads/writes and the normalized tables. Output is `file:line` hits: a starting list, not a verdict.
3. **Trace each save and load path (your judgment).** For every hit: what user action triggers it, what it writes, to which table, and whether a read falls back to the draft or cache as if it were committed. Cross-check with `docs/living/DATA_FLOW_MAP.md`.
4. **Classify** each path with the severities in `rules.md`.
5. **Check server-side enforcement** of the rules in `reference/matatag-rules.md` on the save path (not only in the UI).
6. **Check migration readiness** only if asked or if legacy rows are in scope: read `reference/migration-readiness.md`.
7. **Write the report** using `reference/report-template.md` (findings by severity, then the coverage matrix).

## Before returning the report

Verify with real evidence (command output, opened file:line), not by rereading your own text:
- Every table in `reference/tables.md` appears in the coverage matrix with a status (verified / no code path / not verified), and the inventory output confirms each table exists.
- Every `school_drafts` hit from `scan_references.sh` is classified; none is left unlisted.
- Every finding cites a `file:line` you opened, plus a quoted snippet or query result.
- Both scripts exited 0. If the DB was unreachable or the guard refused, say so and mark DB-dependent rows "not verified" instead of guessing.
- Nothing was modified: `git status` / `git diff --stat` shows no change from this audit, and no non-SELECT SQL was run.
- Anything you could not verify is listed under "Not verified", with the reason.

## Extending

A repeated mistake becomes a rule in `rules.md`; missing context goes in `reference/`; a process problem is fixed in this file. Then re-run to confirm.
