# Chart Patterns

Frozen — do not edit without explicit user instruction to change this
specific file.

## Charting Library

**None.** `client/package.json` declares no charting library (no
recharts, chart.js, d3, visx, nivo, etc. — dependencies are limited to
`idb`, `react`, `react-dom`, `react-icons`, `react-router-dom`, `xlsx`).
All data visualizations in this app are hand-built with plain CSS/HTML,
not an SVG/canvas charting engine.

## Chart Types In Use

1. **Histogram (bar chart)** — `.histogram` / `.histogram-bar-wrap` /
   `.histogram-bar` in `client/src/index.css`, used on the Dashboard and
   Workload pages for distributions (e.g. workload-hours histogram).
   Structure: a flex row of `.histogram-bar-wrap` columns, each a
   flex column with the bar pinned to the bottom (`justify-content:
   flex-end`) and a label below. Bar fill is a vertical gradient
   (`linear-gradient(180deg, var(--blue-600), var(--gold))`) or, in the
   later dashboard-analytics variant, a flat `var(--blue-600)`. Bars get
   a `1px solid white` left/right border to create visual separation
   between adjacent bars. A `.histogram-summary` row of small stat cards
   (`.histogram-summary-card`) typically sits above the bars as
   supporting KPIs.

2. **Horizontal bar / "position chart"** — `.position-chart` /
   `.position-row` / `.position-track` in `index.css`, used to compare
   categorical counts (e.g. personnel by position) as horizontal bars:
   a label column, a track column (rounded `999px` track, presumably
   filled via inline `width: X%` style — the fill itself is set inline
   per row, not in the stylesheet), and a value column.

3. **KPI tiles** (`.kpi`, `.compliance-card`) — not charts but the
   dominant way single numeric metrics are surfaced: a small uppercase
   label (`.kpi span`) over a large bold number (`.kpi strong`, 19–28px).

## Color Usage

Charts reuse the core palette rather than a dedicated chart palette:
`--blue-600` and `--gold` are the two colors that appear in
gradient/bar fills. There is no defined sequential or categorical
multi-color chart palette — [fill in: if a future chart needs more than
2 series, a categorical palette must be defined and added here before
building it, per the `dataviz` design skill's guidance].

## Notes

If a real charting library is introduced in the future, this file
should be updated (with user approval, since it's frozen) to document:
chosen library, standard chart component wrapper location, and how it
maps to the palette in `UI_DESIGN_SYSTEM.md`.
