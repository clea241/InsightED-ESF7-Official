# DEVIATIONS

## 2026-09-07 — Topbar stub vs. inline layout override

**Expected**: A single, consistent header/layout mechanism.
**Found**: `Topbar.jsx` returns `null` (a stub, renders nothing), while
`App.jsx` separately inline-overrides the `.main` CSS margin/width that
would otherwise account for a topbar.
**Why**: Unclear whether this is intentional (topbar deliberately
removed, leftover override) or an unfinished layout change.
**Status**: Open — needs user decision before treating either side as
authoritative.

## 2026-09-07 — No backdrop/Escape close on any modal

**Expected**: Typical modal UX allows closing via backdrop click or
Escape key.
**Found**: None of the ~10+ modals in `client/src/components/`
implement backdrop-click or Escape-key close — only explicit
button-triggered close.
**Why**: Could be intentional (e.g. preventing accidental loss of
in-progress form data) or simply not yet implemented.
**Status**: Open — needs user decision on whether to add these
affordances.

## 2026-09-07 — No shared `<Modal>` component

**Expected**: A shared, reusable modal primitive to keep structure/
styling consistent.
**Found**: Each of the ~10+ modals (`LogoutPasscodeModal`,
`DepEdEmailInfoModal`, `ESF7PrintableReportModal`, `ESF7UploadModal`,
`OverloadPayModal`, etc.) is hand-rolled independently, causing overlay/
card CSS drift between them.
**Why**: Grew organically as modals were added one at a time.
**Status**: Open — flagged as a possible future refactor. Do not act on
this without explicit user approval, per scope-discipline rules in
`CLAUDE.md`.

## 2026-09-09 — Executive Dashboard: unfiltered qualifications query & cross-DB fallback design

**Expected**: Dashboard stats queries scoped to the requesting school,
querying its own database.
**Found**: In `server/controllers/dashboard/index.js`,
`SELECT personnel_id, college_degree AS bachelors_degree FROM esf7_perssonel_educ`
has no `WHERE school_id = ...` filter — it pulls the entire table across
all schools on every dashboard load, then filters in memory by matching
against this school's personnel IDs. Also, the "master insightEd
personnel" fallback and the "school identity" fallback each open a
connection into a second, separate database (`insightEd`) on every
request when the primary `esf7_school_profile`/`esf7_personnel_profile`
data is missing or looks like sample data — a cross-database
per-request dependency baked into the hot path rather than only used
for genuine one-time backfill.
**Why**: Fixed the most severe part (a fresh `pg.Pool` was being opened
and torn down per request for that fallback — now reused as a module-
level singleton), but did not add a `school_id` filter to the
`esf7_perssonel_educ` query or restructure the cross-DB fallback design,
since either could change which personnel show as "qualifications
missing" for schools relying on this fallback path — a data-correctness
risk that needs a decision, not something to guess at while chasing a
performance ask.
**Status**: Open — needs user/product decision on (1) whether
`esf7_perssonel_educ` should always be filtered by school_id (would
require confirming the join path from personnel_id to school), and (2)
whether the `insightEd` cross-DB fallback is still needed as a live
per-request path or only for a one-time backfill job.
