# Layout Structure

Binding constraints for the app shell and page layout. Frozen — do not
edit without explicit user instruction to change this specific file.

## App Shell

- `.app` — top-level wrapper, `min-height: 100vh`, relative positioning.
- `.sidebar` — **fixed** left rail, `72px` wide collapsed, expands to
  `260px` on hover (desktop only; see Responsive below). Full viewport
  height, `z-index: 100`.
- `.main` — content area, `margin-left: 72px` (offsets the fixed
  sidebar), `width: calc(100% - 72px)`, `padding: 24px 28px 32px`,
  `display: grid; gap: 14px`. Note: `App.jsx` currently overrides this
  with inline `marginLeft: 0, width: '100%'` on the `<main>` element —
  [fill in: this inline override appears to contradict the CSS
  `.main` rule; confirm whether the CSS rule is stale/superseded or the
  inline override is a bug].
- `.topbar` — sits inside `.main`, above page content: white background,
  `1px solid var(--line)` bottom border, `12px 24px` padding, holds
  page eyebrow/title/description on the left and `.topbar-actions` on
  the right.

## Grid System

- `.grid` — generic grid, `gap: 12px`.
- `.two-col` / `.three-col` / `.four-col` — equal-width column grids
  (`repeat(N, minmax(0, 1fr))`), `12px` gap.
- `.form-grid` — 3-column form layout, `10px` gap.
- `.kpis` — always 4 columns regardless of count.
- `.full` — spans all grid columns (`grid-column: 1 / -1`), used to
  break a form field out of the column grid.
- Cards (`.card` + `.card-inner`) are the base content container
  everywhere — `2.5px solid var(--outline)` border, `22px` radius, no
  shadow, `16px` inner padding by default (denser variants use `8px`–
  `10px`).

## Page Composition Pattern

Every feature page (`client/src/pages/*.jsx`) follows the same shape:
`<Topbar />` (currently inert, see `COMPONENT_LIBRARY.md`) or
`<PortalHeader />`, then one or more `.card` blocks arranged in the grid
classes above, often split into KPI row → detail table/form → secondary
panels (e.g. Dashboard: KPI row → `.dashboard-card-row` two-panel
validation/histogram layout → analytics grid).

## Responsive Breakpoints

- `1120px` — form grids (`.two-col`, `.three-col`, `.four-col`,
  `.form-grid`) collapse to a single column; workload rows stack
  vertically; training rows go to 2 columns.
- `1024px` — (legacy Vite-boilerplate breakpoint in `App.css`, not part
  of the real app layout — see `UI_DESIGN_SYSTEM.md` note on `App.css`).
- `1000px` — the sidebar switches from a fixed left rail to a **fixed
  bottom nav bar** (icon grid, `grid-template-columns: repeat(var(--nav-count),
  1fr)`), hover-to-expand is disabled, and section labels disappear
  (icon-only bottom nav). `.main` padding reduces to `15px 16px`.
- `900px` / `640px` — 3-column profile form grids step down to 2 then 1
  column.
- `640px` — topbar becomes a stacked grid layout; `.kpis` drops to 2
  columns; dashboard two-panel rows stack to 1 column.

## Sticky Elements

- `.profile-subnav` (the step navigator on `PersonnelProfile`) is
  `position: sticky; top: 14px`, keeping step navigation visible while
  scrolling a long profile form.
