# User Preferences & Conventions

## UI & Coding Style
- Framework: React (Client) + Express/Node.js (Server)
- Styling: Custom Vanilla CSS / Glassmorphism / Sleek Dark/Light themes
- Naming: Clean, descriptive names matching ESF7 conventions

## Iconography & UI Consistency Standard (esf7-icon-architect)
- **Official Icon Library**: `react-icons/fi` (Feather Icons) is the exclusive icon standard across all pages, modals, and components.
- **Sidebar-Matching Glyph Iconography**: Across all tabs, pages, and components (Dashboard, Organized Classes, Workload, Roster, Profiling, Overload, etc.), use clean, minimal, professional sidebar-style glyph icons (`⌂`, `🏛`, `☷`, `✎`, `⚜`, `▦`, `◷`, `⛶`, `✉`, `⇄`, `👤`, `ⓘ`) or Feather Icons (`react-icons/fi`) rather than casual, oversized, or multi-color emojis.
- **Prohibited Libraries**: Never mix other icon libraries (`@heroicons`, `react-icons/fa`, `react-icons/bi`, `react-icons/md`, `lucide-react`).
- **Clean Read-Only Display Cards**: Avoid large, distracting solid background color warning cards (`#FFFBEB`, `#FEF2F2`). Use clean typography, crisp borders, and subtle status text with minimal indicators.

## Navigation, Routing & History Conventions
- **Bidirectional URL Synchronization**: Always synchronize `activeView` state with URL query parameters (`?view=<module>`) using `window.history.pushState` on active navigation and `window.history.replaceState` on initial load.
- **Browser Back/Forward Navigation**: Maintain a global `popstate` listener in `AppContext.jsx` to ensure native browser Back/Forward buttons navigate between internal views instead of popping out to external pages or new tabs.
- **Deep-Linking**: Direct URLs like `?view=school`, `?view=workload`, `?view=roster`, or `?view=overload` must initialize the application directly into that module once authenticated.

## React Rules of Hooks Standard
- **Strict Top-Level Declaration**: In all functional components (especially `App.jsx` / `MainAppContent` and page roots), all Hooks (`useAuth`, `useApp`, `useState`, `useRef`, `useMemo`, `useEffect`) must be declared unconditionally at the very top of the component body **before** any conditional early returns (such as `if (authLoading)`, `if (!user)`, or `if (isRoomProfiling)`).

## Global Loading Screen Standard
- **Canonical Component**: Use `client/src/components/LoadingScreen.jsx` for all module loading transitions, initial boot sequences, and embedded sub-view loaders.
- **Cadence & Aesthetics**: Standard 3.2s looping rhythm with DepEd blue aura pulse. Use the `inline` prop with `size="medium"` or `size="small"` for embedded tab loading (e.g. Dashboard stats, Overload computation).

## Visual Indicators & Feedback UX
- Newly created cards in dense lists (e.g., Workload schedules in Personnel Profiles) should feature auto-scroll focus (`scrollIntoView`) and temporary pulsing highlight borders (`.workload-card-newly-added`) to maintain clarity when viewing large datasets.

## ⚙️ Mandatory Backend & Queue Worker Synchronization Standard
- **Always Include Queue Worker (`server/queue_worker.js`) When Fixing Backend**: Whenever adding, refactoring, modifying schemas, fixing columns, or updating controllers/endpoints on the server (e.g., `esf7_workload_rows`, `esf7_personnel_profile`, organized classes, appointments, overload, terms, etc.), you **MUST ALWAYS** simultaneously audit, update, and verify `server/queue_worker.js`. Both the direct API persistence layer and the asynchronous submission queue ingestion worker must stay 100% synchronized in data structures, column names, transformations, and term scoping.