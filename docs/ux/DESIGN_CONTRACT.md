# Design Contract

Indexes all UI/UX spec files below. This file (and everything it
indexes) is **frozen** — binding constraints, not suggestions. Do not
edit without explicit user instruction to change this specific file.

All specs below were extracted from the live app code
(`client/src/index.css`, `client/src/components/`, `client/src/pages/`)
on 2026-09-07, since no prior written spec existed. Where the code was
ambiguous or a pattern was genuinely absent, the spec says so explicitly
(`[fill in: ...]`) rather than inventing a rule — treat those as open
questions for the user, not gaps to silently fill during feature work.

## Spec Index

- `UI_DESIGN_SYSTEM.md` — color palette, typography (Plus Jakarta Sans),
  spacing, border-radius, shadows/elevation, iconography, dark mode
  (none).
- `COMPONENT_LIBRARY.md` — inventory of `client/src/components/`,
  button/badge/form-input conventions, toast mechanism.
- `CHART_PATTERNS.md` — no charting library in use; hand-built CSS
  histogram and horizontal-bar patterns only.
- `INTERACTION_PATTERNS.md` — toast/confirm-modal feedback, form
  traffic-light coloring, active-state gold-underline signature,
  drag-and-drop, keyboard behavior.
- `LAYOUT_STRUCTURE.md` — app shell (sidebar + main + topbar), grid
  system, page composition pattern, responsive breakpoints.
- `TABLE_BEHAVIORS.md` — `.table-wrap` structure, client-side sort/
  filter, row click, dense validation-table variant.
- `MODAL_PATTERNS.md` — no shared Modal component (each modal hand-
  rolled), structure, close behavior (no backdrop/Escape close today),
  animation, action-button layout.
- `SETTINGS_PATTERNS.md` — no settings page exists yet.
- `HEADER_FOOTER_PATTERNS.md` — no app footer; two header patterns
  (`.topbar` CSS vs. `PortalHeader.jsx` component; `Topbar.jsx` itself
  is currently a stub).
- `NAVIGATION_FLOW.md` — manual `activeView` state switching (no
  router), sidebar + Node Map dual navigation, node-locking/progressive-
  journey mechanic, passcode-gated sign out.

## Known Open Questions

Several specs above flag unresolved ambiguities found while extracting
from code (not decisions — flag these to the user before treating them
as settled):
- `Topbar.jsx` returns `null`; `App.jsx` also inline-overrides `.main`'s
  CSS margin/width. Unclear whether these are intentional or leftover
  from a layout change in progress.
- No backdrop-click or Escape-key close on any modal — confirm whether
  this is intentional (e.g. to prevent accidental data loss on forms)
  or a gap to fix.
- No shared `<Modal>` component despite ~10+ hand-rolled modals — flag
  as a possible refactor, do not act on it without approval per scope-
  discipline rules in `CLAUDE.md`.
