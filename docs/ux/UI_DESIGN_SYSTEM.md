# UI Design System

Binding constraints for colors, typography, spacing, and iconography.
Frozen — do not edit without explicit user instruction to change this
specific file. Extracted from `client/src/index.css` (the live
stylesheet; `client/src/App.css` is unused Vite-template boilerplate
left over from scaffolding and is not part of the real design system).

## Color Palette

Defined as CSS custom properties on `:root` in `client/src/index.css`:

| Token | Value | Usage |
|---|---|---|
| `--navy` | `#08315F` | Primary dark brand color — headings, active nav, dark gradients |
| `--blue` | `#075985` | Primary buttons, links, active tabs |
| `--blue-600` | `#0284C7` | Focus rings, input focus border, chart bars |
| `--blue-400` | `#7DD3FC` | Hover borders, subtle accents |
| `--blue-100` | `#E0F2FE` | Selected chip/option backgrounds |
| `--blue-50` | `#F0F9FF` | Page background base, subtle panel backgrounds |
| `--gold` | `#FBBF24` | Accent stripe (active state underline via `inset 0 -3px 0`), eyebrow text |
| `--amber` | `#D97706` | Secondary accent, gradient pairing with gold |
| `--red` | `#B91C1C` | Danger/error state, danger buttons |
| `--green` | `#16A34A` | Success/"answered" state |
| `--purple` | `#7C3AED` | [fill in: observed usage not yet traced] |
| `--card` | `#FFFFFF` | Card background |
| `--text` | `#0F172A` | Primary body text |
| `--muted` | `#64748B` | Secondary/label text |
| `--line` | `#BAE6FD` | Default border color for inputs, cards, tables |
| `--outline` | `color-mix(in srgb, var(--blue) 64%, var(--navy) 36%)` | Card/modal outer border |

Semantic status colors (used directly as hex, not tokenized):
- Info: bg `#DBEAFE`, text `#1E40AF`
- Warning: bg `#FEF3C7`, text `#92400E`
- Error: bg `#FEE2E2`, text `#991B1B`
- Success/OK: bg `#DCFCE7`, text `#166534`

Category badges (personnel category tagging):
- Teaching: bg `#DBEAFE`, text `#1D4ED8`
- Teaching-related: bg `#F3E8FF`, text `#7E22CE`
- Non-teaching: bg `#FEF3C7`, text `#92400E`

Page background: a fixed radial-gradient wash of navy/gold/blue/amber at
low opacity over `--blue-50`, giving the app shell a soft branded
backdrop behind all cards (`body` in `index.css`).

## Typography

- **Font family**: `"Plus Jakarta Sans"` (Google Fonts import), falling
  back to `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif`. Same family used for both `--font-heading`
  and `--font-body` — there is no separate heading typeface.
- **Headings** (`h1`, `.card h2`/`.panel-title`, section titles): font
  weight 800, negative letter-spacing (`-0.02em` to `-0.03em`) on large
  titles, uppercase + wide letter-spacing (`.07em`–`.18em`) on small
  eyebrow/label/section-header text.
- **Body/labels**: weight 700 is the default "readable" weight for most
  UI text (subtext, table cells, badges); plain paragraph text is not
  weight 400 anywhere observed — this UI leans heavy/bold throughout.
- **Type scale observed** (px): 8, 9, 10, 11, 12, 13, 14, 15, 16, 18,
  19, 20, 22, 24, `clamp(24px, 2.2vw, 34px)` for the page `<h1>`.

## Spacing & Layout

- No fixed spacing scale variable — spacing values are hardcoded per
  component, commonly in the 4/5/6/8/10/12/14/16/20/24/32px range.
- Grid gaps: `.grid`/`.two-col`/`.three-col`/`.four-col` use `gap: 12px`;
  `.kpis` and `.form-grid` use `10px`.
- Sidebar: collapsed width `72px`, expanded (hover) width `260px`.
- Main content: `margin-left: 72px` (offsets fixed sidebar), padding
  `24px 28px 32px`.

## Border Radius

No single `--radius` scale is used consistently — values vary by
component size:
- Cards/modals: `22px`–`24px` (`--radius: 22px` token used on `.card`)
- Buttons/inputs: `12px`
- KPI tiles, panels: `14px`–`18px`
- Pills/badges/status chips: `999px` (full round)
- Small chips (nav badge, day-check): `999px` or `16px`

## Shadows / Elevation

- Cards: **no shadow** by default (`.card { box-shadow: none; }`) — cards
  are distinguished by a `2.5px` colored border (`--outline`), not
  elevation.
- Sidebar: `18px 0 42px rgba(11, 31, 77, .16)`.
- Modals: `0 26px 70px rgba(8, 49, 95, .28)`.
- Dropdown/popover menus: `0 18px 45px rgba(8, 49, 95, .18–.22)`.
- Active tab/nav/day-check state: an inset gold underline —
  `inset 0 -3px 0 var(--gold)` — is the recurring "this is selected"
  signature across tabs, nav buttons, and day-of-week toggles.

## Iconography

- **No icon component library is used for primary navigation** — nav
  and section icons are single Unicode glyph characters (e.g. `⌂`, `🏛`,
  `☷`, `✎`, `⚜`, `▦`, `◷`, `⛶`, `✉`, `⇄`, `₱`, `⛨`, `⎋`) rendered via a
  `data-icon` attribute + `content: attr(data-icon)` CSS pseudo-element
  (see `client/src/components/Sidebar.jsx` and the `.nav button::before`
  rule in `index.css`).
- `react-icons` (^5.6.0) is a declared dependency but its actual usage
  scope was not confirmed in this pass — [fill in: audit which
  components use `react-icons` vs. the glyph convention above, and
  document which pattern new work should follow].
- Toast/status messages use emoji directly inline (⚠️ for error, ✅ for
  success) rather than an icon component.

## Dark Mode

Not implemented. The app is light-theme only; no `prefers-color-scheme`
or theme-toggle logic was found in `index.css` or `App.jsx`.
