# Modal Patterns

Binding constraints for modal/dialog behavior. Frozen — do not edit
without explicit user instruction to change this specific file.

## No Shared Modal Component

There is **no shared `<Modal>` wrapper component**. Every modal
(`ESF7PrintableReportModal`, `ESF7UploadModal`, `DepEdEmailInfoModal`,
`LogoutPasscodeModal`, `OverloadPayModal`, the global custom-confirm
modal in `App.jsx`, and various inline modals in page files like
`PersonnelProfile.jsx`, `Workload.jsx`, `Dashboard.jsx`, `Roster.jsx`)
hand-rolls its own backdrop + card markup, either via the shared CSS
classes (`.modal-backdrop`, `.modal-card`, `.modal-head`, `.modal-body`,
`.modal-actions` in `client/src/index.css`) or fully inline styles
(e.g. `LogoutPasscodeModal.jsx` uses inline styles exclusively, not the
shared classes). New modals should prefer the shared `.modal-backdrop`/
`.modal-card` CSS classes over reinventing inline styles, but a
componentized wrapper does not exist yet — [fill in: consider whether
the user wants a shared `<Modal>` component introduced, since the
duplication across ~10+ hand-rolled modals is a maintenance risk].

## Standard Structure

- **Backdrop**: `position: fixed; inset: 0;` full-screen overlay,
  `rgba(8, 49, 95, .44)` (shared-class modals) or `rgba(15, 23, 42, 0.45–0.65)`
  (inline modals) with `backdrop-filter: blur(4–8px)`. `z-index` values
  are inconsistent across modals (`2000`, `99998`, `99999`) — [fill in:
  no single z-index scale is defined; a new modal should use a value
  higher than any existing overlay it may stack above].
- **Card**: white background, border-radius `16px`–`24px` (`24px` via
  `--radius`-derived `.modal-card`), border `1.5px`–`2.5px` solid (either
  `var(--outline)` or a light gray), shadow `0 25px 50px -12px
  rgba(0,0,0,.25)` to `0 26px 70px rgba(8,49,95,.28)`.
- **Sections** (shared-class pattern): `.modal-head` (title + close
  button, bottom border), `.modal-body` (content, padded), `.modal-actions`
  (right-aligned button row, `justify-content: flex-end`, `gap: 8px`,
  `margin-top: 14px`).
- **Sizing**: `width: min(760px, 100%)` is the shared-class default;
  individual modals override (`420px` for the confirm dialog, `440px`
  for the passcode modal, `min(1040px, 100%)` for the wider school-
  assignment modal).

## Close Behavior

- **Explicit close button** (`.modal-close`, `min-width: 42px`) or a
  `Cancel`/`✕` control is the only reliable close path in every modal
  read.
- **Backdrop click to close**: not implemented anywhere — clicking
  outside the card does not close a modal in this app. Do not assume
  this behavior when building new modals unless explicitly requested.
- **Escape key to close**: not implemented anywhere. Do not assume this
  behavior either.
- This is a real UX gap relative to common modal conventions — log it
  as a deviation if it comes up, per `docs/living/DEVIATIONS.md`, rather
  than silently adding backdrop/Escape close to only one modal.

## Animation

- Entrance animation is standard: `scaleUp` (opacity 0→1, `scale(0.95)
  → scale(1)`) or `modalSlideIn`, both `~0.2s cubic-bezier(0.16, 1, 0.3,
  1)`. No exit animation — modals unmount instantly on close (no fade-out).

## Action Button Layout

- Buttons are right-aligned, in a row, with `Cancel`/secondary action on
  the **left**, primary/confirm action on the **right** — e.g. `App.jsx`'s
  global confirm modal (`Cancel` then `Confirm`), `LogoutPasscodeModal`
  (`Cancel` then `Confirm & Logout ➔`).
- Primary action styling: solid brand-color background (`.btn` /
  `linear-gradient(180deg, var(--blue), var(--navy))`) or, for
  destructive actions (logout, delete), a red gradient
  (`linear-gradient(135deg, #DC2626, #B91C1C)`).
- Secondary/cancel: white background, colored border, colored text
  (`.btn.secondary`).
- Destructive confirm actions use `.btn.danger` (red border + red
  background) where the shared class system is used.
