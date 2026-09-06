# Interaction Patterns

Binding constraints for common interaction behaviors across the app.
Frozen — do not edit without explicit user instruction to change this
specific file.

## Feedback / Notifications

- **Toast**: single global toast via `AppContext` (`showToast(message,
  type)`), fixed top-center, auto-dismiss after 3.5s, green gradient
  (success) or red gradient (error), ✅/⚠️ emoji prefix, `slideDown`
  entrance animation. This is the app's only transient-feedback
  mechanism — use it for any new success/error confirmation rather than
  a one-off inline message, unless the feedback needs to persist next
  to a specific field (see form validation coloring below).
- **Confirm dialogs**: a global reusable confirm/alert modal is exposed
  via `AppContext`'s `customModal` state (rendered once in `App.jsx`),
  with `type: 'confirm'` showing Cancel+Confirm and other types showing
  just Confirm. Prefer this over building a one-off confirm modal.

## Form Field State (Traffic-Light Coloring)

Applied live as a user types/selects, not only on submit:
- Empty required field → `.empty-field` (red border `#EF4444`, light
  red background `#FEF2F2`).
- Filled field → `.answered-field` (green border `#16A34A`, light green
  background `#F0FDF4`, bold green text). Also applies to
  `SearchableDropdown` via `.answered-dropdown`.
This gives users constant visual progress feedback on long forms
(Workload, PersonnelProfile) — any new long-form field should follow
this same empty/answered coloring rather than only validating on
submit.

## Hover / Active States

- The recurring "selected/active" signature across nav buttons, tabs,
  day-of-week toggles, and date-picker days is an **inset gold
  underline**: `inset 0 -3px 0 var(--gold)`, usually paired with a
  `linear-gradient(180deg, var(--blue), var(--navy))` background. Any
  new toggle/tab/segmented-control component should reuse this exact
  active-state treatment rather than inventing a new one.
- Clickable rows/cards get a subtle `var(--blue-50)` hover background
  (table rows) or a small `translateY(-1px)` lift with border-color
  shift (`.profile-subnav button:hover`).
- Buttons and interactive cards use `transition` on `box-shadow`/
  `transform`/`border-color` in the `0.12s–0.3s` range — snappy, not
  slow.

## Just-Added Highlight

`.just-added-highlight` — a pulsing glow animation (`justAddedGlow`,
2s infinite alternate, blue box-shadow pulse) applied to a row
immediately after it's added (e.g. a newly-added workload row), giving
the user a moment of visual confirmation before the highlight settles.
Reuse this for any "just created" list-item feedback rather than a
toast alone.

## Drag & Drop

`ESF7UploadModal.jsx` implements a drag-active state (`dragActive`) for
`.xlsx` file upload — border/background change while a file is dragged
over the drop zone. This is the only drag-and-drop interaction found;
follow the same `dragActive` boolean-state pattern if adding another
file-drop zone.

## Keyboard Interactions

- `SearchableDropdown`: Enter selects the first filtered match (or
  commits a custom value if `allowCustom`); no arrow-key navigation of
  the option list was found.
- `LogoutPasscodeModal` / `PinLogin`: auto-advance focus to the next
  digit box on input, Backspace moves focus back on an empty box,
  paste-to-fill supported (6-digit paste auto-distributes across boxes).
- **No Escape-to-close or Tab-trap focus management** was found in any
  modal — see `MODAL_PATTERNS.md`.
