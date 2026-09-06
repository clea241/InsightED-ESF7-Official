# Header & Footer Patterns

Binding constraints for page headers and footers. Frozen — do not edit
without explicit user instruction to change this specific file.

## No Global App Footer

No app-level footer component exists. `footer`-related matches found in
the codebase are scoped to individual modal action bars
(`.modal-actions`/`modal-footer`-style button rows in `ESF7UploadModal`,
`OverloadPayModal`, `ESF7PrintableReportModal`,
`DepEdEmailInfoModal`), not a page or app footer.

## Two Header Patterns

1. **`.topbar`** — the CSS-defined default page header, rendered inside
   `.main` above page content: `.eyebrow` (small gold uppercase label)
   + `<h1>` page title (`clamp(24px, 2.2vw, 34px)`, weight 800) +
   optional description paragraph on the left, `.topbar-actions` (right-
   aligned, stacked) on the right. Note: `Topbar.jsx` — the component
   that would render this — currently returns `null` (see
   `COMPONENT_LIBRARY.md`); [fill in: confirm whether pages that expect
   `.topbar` styling are rendering their own header markup directly
   instead].

2. **`PortalHeader.jsx`** — a richer, component-based header used on
   portal-style pages: department/bureau eyebrow text, title,
   description, an optional back button (`FiArrowLeft`, customizable
   `backText`), an optional custom action button, and a logout control
   (`FiLogOut`) that opens `LogoutPasscodeModal`. This is the pattern to
   reach for on any new full-page portal view (as opposed to a
   dashboard-embedded card view).

## Header Content Conventions

- Eyebrow text: gold (`var(--gold)`), 11px, weight 800, uppercase,
  `.18em` letter-spacing — always precedes the `<h1>`, never used alone.
- Title: always weight 800, tight/negative letter-spacing, DepEd/school
  branding (region, division, district, school year) shown as
  supporting context rather than in the title itself — see
  `ESF7PrintableReportModal.jsx`'s default fallback values
  (`REGION IV-A`, `LAGUNA`, `MAJAYJAY`, `SY 2026-2027`) as the reference
  format for how these fields should read when populated.
