# User Preferences & Conventions

## UI & Coding Style
- Framework: React (Client) + Express/Node.js (Server)
- Styling: Custom Vanilla CSS / Glassmorphism / Sleek Dark/Light themes
- Naming: Clean, descriptive names matching ESF7 conventions

## Iconography & UI Consistency Standard
- **Sidebar-Matching Glyph Iconography**: Across all tabs, pages, and components (Dashboard, Organized Classes, Workload, Roster, Profiling, Overload, etc.), use clean, minimal, professional sidebar-style glyph icons (`⌂`, `🏛`, `☷`, `✎`, `⚜`, `▦`, `◷`, `⛶`, `✉`, `⇄`, `👤`, `ⓘ`) rather than casual, oversized, or multi-color emojis.
- **Clean Read-Only Display Cards**: Avoid large, distracting solid background color warning cards (`#FFFBEB`, `#FEF2F2`). Use clean typography, crisp borders, and subtle status text with minimal indicators.

## Visual Indicators & Feedback UX
- Newly created cards in dense lists (e.g., Workload schedules in Personnel Profiles) should feature auto-scroll focus (`scrollIntoView`) and temporary pulsing highlight borders (`.workload-card-newly-added`) to maintain clarity when viewing large datasets.