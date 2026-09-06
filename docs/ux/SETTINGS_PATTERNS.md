# Settings Patterns

Binding constraints for settings/configuration UI. Frozen — do not edit
without explicit user instruction to change this specific file.

## No Dedicated Settings Page

There is no `Settings` page or settings section in `client/src/pages/`.
The only user-facing "settings"-like matches in the codebase are
incidental (`Workload.jsx`, `ValidationCenter.jsx` reference config
values, not a settings UI). School/account-level configuration
currently lives inside the relevant feature page instead of a separate
settings area:
- School identity/shift config → `SchoolProfile.jsx` (reached via the
  "School Profile" node/sidebar item, not a settings menu).
- Auth/session (PIN, logout) → handled inline via
  `LogoutPasscodeModal.jsx` / `PinLogin.jsx`, not a settings page.

## If a Settings Page Is Introduced

[fill in: this file should be populated with real patterns once a
settings page/section actually exists in the app — form layout,
save/cancel behavior, and section grouping should follow the existing
`.card` + `.form-grid` conventions in `UI_DESIGN_SYSTEM.md` and
`LAYOUT_STRUCTURE.md` rather than inventing a new visual language. Do
not build a settings page pattern speculatively — wait for the user to
request one, then extract/document it here.]
