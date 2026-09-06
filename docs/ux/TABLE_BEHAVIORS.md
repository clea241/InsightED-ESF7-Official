# Table Behaviors

Binding constraints for table layout, sorting, and filtering. Frozen —
do not edit without explicit user instruction to change this specific
file.

## Structure

- `.table-wrap` — wraps every table: `overflow-x: auto`, `1.5px solid
  var(--line)` border, `18px` border-radius, white background. Tables
  never render unwrapped.
- `table` — `border-collapse: collapse`, `table-layout: fixed` (fixed
  layout is the default; `school-assignment-table` explicitly opts into
  `table-layout: auto` when column widths need to flex to content).
- `th` — uppercase, `var(--muted)` color, `#F8FAFC` background, 10px,
  weight 800, letter-spacing `.13em`.
- `td`/`th` — `padding: 10px 8px`, `1px solid #E2E8F0` bottom border,
  `overflow-wrap: anywhere` (long values wrap rather than overflow).

## Sorting

- Column headers are clickable buttons (`.roster-sort-button` class —
  full-width, transparent, inherits table-header typography) rather
  than a separate sort icon control.
- Sort state is local component state: `{ key, direction: 'asc'|'desc' }`.
  Clicking the currently-sorted column toggles direction; clicking a new
  column sorts ascending by default (see `Roster.jsx`).
- No visual sort-direction indicator (arrow) was found on the sort
  button itself — [fill in: confirm whether an indicator should be
  added, since its absence makes current sort direction hard to see].

## Filtering

- Filtering is done via a text/dropdown filter row above the table
  (`.roster-filter` — compact `34px` min-height input), filtering
  client-side over the already-loaded dataset (`.filter()` in
  component state), not server-side pagination.
- No pagination component was found in this pass — tables render their
  full filtered dataset. [fill in: confirm this is acceptable at current
  data volumes, or whether pagination should be introduced for large
  rosters].

## Row Interaction

- `.roster-row { cursor: pointer; }` with a hover background
  (`var(--blue-50)`) signals that a row is clickable — used where a row
  click opens a detail/edit view (e.g. Roster → PersonnelProfile).
- Rows are not individually selectable via checkbox except in specific
  bulk-action contexts (e.g. `.school-assignment-table` has a checkbox
  first column for multi-select assignment).

## Dense/Compact Variant

- `.validation-table` is a visually denser variant (10–12px font,
  3–4px vertical padding) used in the Validation Center for large
  checklists — status shown via `.validation-status-pill` in the last
  column, sortable via `.validation-sort` (same toggle-button pattern
  as `.roster-sort-button`).
