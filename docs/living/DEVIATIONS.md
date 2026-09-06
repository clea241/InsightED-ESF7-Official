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
