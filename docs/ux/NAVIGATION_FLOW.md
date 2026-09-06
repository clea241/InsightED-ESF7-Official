# Navigation Flow

Binding constraints for how users move through the app. Frozen — do
not edit without explicit user instruction to change this specific
file.

## No Router-Driven Navigation

Despite `react-router-dom` being a dependency, `App.jsx` does **not**
use it for view switching. Navigation is a manual conditional render
tree keyed off `AppContext`'s `activeView` string state (`setActiveView`)
— see `ARCHITECTURE.md` Conventions section. There are no deep-linkable
URLs for internal views; the only URL-driven route is the public Room
QR bypass (`?view=room-profiling` query param, checked directly in
`App.jsx` before auth). New pages should be added the same way: a new
`activeView` string, a case in `App.jsx`'s render list, and an entry in
`Sidebar.jsx`'s `sections` array — not a new router route.

## Two Navigation Surfaces

1. **Sidebar** (`Sidebar.jsx`) — persistent, collapsible-section list,
   always available once logged in. Grouped into: "ESF7 Core Registry"
   (Dashboard, School Profile, Personnel Roster, Personnel Profiling,
   Designations, Organized Classes, Workload), "Portals & Utilities"
   (Room QR Portal, Requests — with a live unread-count badge),
   "Teaching Overload", "Others" (Allowances & Incentives), "Quality
   Audit & Certification" (Validation Center) — plus a fixed bottom
   block for Validation Center (duplicated) and Sign Out.
2. **Node Map** (`NodeMap.jsx`) — a guided, numbered "progressive
   journey" view (numbered `01`–`06`+ nodes, grouped into sections
   mirroring the sidebar groups) that doubles as the app's onboarding/
   completion tracker. Each node shows a live summary stat (e.g. "42
   Registered Personnel") and links to the same `activeView` as its
   sidebar counterpart.

## Node Locking

- `AppContext` exposes `isNodeUnlocked(view)` / `isNodeCompleted(view)` /
  `bypassNodeLocks` / `setBypassNodeLocks`. A small set of views are
  always accessible regardless of lock state: `dashboard`, `nodemap`,
  `room-profiling`, `room-qr`, `requests` (the `standaloneViews` array
  in `App.jsx`). Every other view is gated: if `isNodeUnlocked` returns
  false for the target view, `App.jsx` force-redirects to `nodemap` and
  shows an error toast ("This node is locked. Complete the preceding
  steps on the Node Map first."). This enforces the intended completion
  order (School Profile → Roster → Profiling → Designations → Classes →
  Workload) without hard-blocking sidebar clicks with disabled buttons —
  the redirect + toast is the enforcement mechanism. [fill in: exact
  unlock rule per node — e.g. does completing node N unlock N+1, or is
  it a different dependency graph — was not traced in this pass; see
  `AppContext.jsx`'s `isNodeUnlocked` implementation before changing
  lock logic].
- `bypassNodeLocks` exists as an override, presumably for admin/debug
  use — [fill in: confirm who can toggle it and where in the UI].

## Auth Gating

`App.jsx` gates the entire shell on `useAuth()`: shows `LoadingScreen`
while `authLoading`, renders `Login` if no `user`, otherwise renders the
sidebar + main app. The Room QR public bypass is checked *before* the
auth gate, so it never requires login.

## Sign Out

Sign out requires re-entering a 6-digit passcode via
`LogoutPasscodeModal` — it is not a single click, by design (station-
lock use case for shared devices).
