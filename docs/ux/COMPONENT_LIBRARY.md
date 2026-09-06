# Component Library

Inventory of reusable UI components and their conventions. Frozen — do
not edit without explicit user instruction to change this specific file.

## Component Inventory (`client/src/components/`)

| Component | Purpose |
|---|---|
| `Sidebar.jsx` | Fixed left nav, hover-to-expand (72px → 260px), collapsible sections, glyph icons via `data-icon` |
| `Topbar.jsx` | **Stub — returns `null`.** Rendered in `App.jsx` but currently inert. [fill in: confirm with user whether Topbar is deprecated/being replaced, since `PortalHeader.jsx` appears to serve a similar role on some pages] |
| `PortalHeader.jsx` | Page-level header used on portal-style pages (back button, title, description, logout, action button); uses `react-icons/fi` (`FiArrowLeft`, `FiLogOut`, `FiRotateCcw`) |
| `LoadingScreen.jsx` | Full-screen loading overlay shown during auth check (`App.jsx`) — fixed, blurred white background |
| `PageTransition.jsx` | Wraps page content in a `scaleUp` entrance animation (0.3s) |
| `BlueprintBackground.jsx` | Decorative animated SVG background (responsive viewBox by screen width), likely used on Login/NodeMap |
| `SearchableDropdown.jsx` | Custom searchable single-select combobox (type-to-filter, optional custom-value entry, click-outside-to-close, Enter-to-select first match) |
| `LogoutPasscodeModal.jsx` | 6-digit PIN re-auth modal required before logout, inline-styled (does not use shared `.modal-*` classes) |
| `PinLogin.jsx` | Numeric PIN-pad login screen, auto-submits at 6 digits |
| `DepEdEmailInfoModal.jsx` | Informational modal explaining DepEd email requirements |
| `ESF7UploadModal.jsx` | Drag-and-drop `.xlsx` ESF7 file import/parse flow, uses `react-icons/fi` and `utils/esf7Harvester.js` |
| `ESF7PrintableReportModal.jsx` | Print-formatted ESF7 report preview modal, pre-fills DepEd region/division/district defaults |
| `OverloadPayModal.jsx` | Month-picker + form for teaching overload pay entries |
| `SchoolHeadChatWidget.jsx` | Floating chat widget (bottom-corner bubble) for messaging SDO/HRMO/ADMIN, polls a chat API |

## Icon Convention (two systems in use)

- **Sidebar/nav/status glyphs**: single Unicode characters via
  `data-icon` attribute (see `UI_DESIGN_SYSTEM.md`) — used for primary
  navigation only.
- **`react-icons/fi` (Feather icons)**: used inside specific components
  (`PortalHeader.jsx`, `ESF7UploadModal.jsx`) for inline action icons
  (back arrow, logout, upload, check, alert, close, file, users,
  calendar). New components needing an inline action icon should use
  `react-icons/fi` to match this precedent, not introduce another icon
  set.

## Buttons

- `.btn` — primary button: solid `var(--blue)` background, white text,
  `min-height: 42px`, `border-radius: 12px`, weight 800.
- `.btn.secondary` — white background, `var(--blue)` text/border (same
  border color as primary).
- `.btn.danger` — red (`var(--red)`) border + background, for
  destructive actions.
- Buttons frequently override background inline with a
  `linear-gradient(180deg, var(--blue), var(--navy))` for a richer
  "primary" look beyond the flat `.btn` default — this is the more
  common look in practice (nav active state, tab active state, date-
  picker day active state all reuse this exact gradient).

## Badges / Status Pills

- `.badge` / `.status` — base pill: `border-radius: 999px`, uppercase,
  10px, weight 800. Variants: `.info` (blue), `.warn` (amber), `.error`
  (red), `.ok` (green) — see literal hex values in `UI_DESIGN_SYSTEM.md`.
- `.category-badge` — personnel category tagging (teaching / teaching-
  related / non-teaching), same pill shape, different palette.
- `.validation-status-pill` — smaller variant (8px/9px font) used inside
  the Validation Center's dense table.

## Form Inputs

- Native `input`/`select`/`textarea`: `min-height: 42px`, `border-radius:
  12px`, `1.5px solid var(--line)`, focus state adds
  `box-shadow: 0 0 0 3px rgba(125, 211, 252, .32)` + border color
  `var(--blue-600)`.
- **Field validation coloring**: `.empty-field` (red border + light red
  background) marks a required-but-unfilled field; `.answered-field`
  (green border + light green background, bold green text) marks a
  filled field. This "traffic-light" fill-state coloring is applied
  live as the user fills a form, not just on submit error — expect this
  pattern on any long form (see Workload, PersonnelProfile pages).
- `SearchableDropdown.jsx` — custom combobox, see inventory above.
- `.multi-select-field` / `.multi-select-chips` / `.multi-select-menu` —
  chip-based multi-select pattern (used for e.g. school assignment).
- `.date-field` / `.date-picker-popover` — custom date picker (not a
  native `<input type="date">`), opens a popover grid on click.

## Loading State

- `LoadingScreen.jsx` is the only dedicated loading component, used at
  the app-shell level (auth check). [fill in: confirm whether individual
  pages have their own inline loading/skeleton states, or a spinner
  convention — not traced in this pass].

## Toast Notifications

- A single global toast (not a component file — inlined in `App.jsx`),
  driven by `AppContext`'s `toast`/`setToast`. Fixed top-center,
  auto-dismisses after 3.5s, green gradient for success / red gradient
  for error, with ✅/⚠️ emoji prefix. Any new success/error feedback
  should go through this existing `showToast()` mechanism rather than a
  new one-off notification.
