# BUSINESS LOGIC

## Draft saving rules (2026-10-08)
- "Saved" is shown only after the server confirmed the database write.
- A save based on an older server version is rejected (409) and never overwrites the newer copy; the user chooses, and both versions are kept.
- Logout is blocked until pending changes are saved (or the user explicitly chooses to keep a local copy).
- Cloud auto-save never runs while the initial load is failed/partial; an empty roster never replaces a populated one.

## Access control (2026-10-08)
- Every API request except health, login, room-profiling (public QR/passcode flow) and salary-matrix needs a valid login token. A request may only name the user's own school. Exceptions: Admin / Super Admin (any school); School Division Office (schools in the same division) and Regional Division Office (same region), checked on the server; denied when the lookup fails.
- Room Profiling's roster endpoints stay public (teachers use them without logging in); the general personnel and autofill endpoints they used to fall back to now require login.

## Workload plotting lock (2026-10-09)
- A teaching / teaching-related teacher with no assigned grade level(s) in Personnel Profiling (Teaching tab) cannot have teaching blocks plotted: no drag-create, move/resize, Ctrl+V paste, Organized Classes / Subjects Taught picking, or By Section slot assignment.
- Admin / relieving-duty blocks ("+ Add Admin Task") and non-teaching personnel are unaffected.
- Server enforces it on workload save (422 `NO_CLASSES_ASSIGNED`). Teaching blocks already saved for such a teacher are kept (not deleted) and flagged in the editor for the user to resolve.

## Workload: which copy wins (2026-10-09)
- The saved rows in `esf7_workload_rows` are the baseline for a teacher + term. The local draft (`draft_workload_<id>` / school draft) is kept only when it holds unsaved changes made on top of the saved version it started from (`workloadBaseVersion`).
- If the database moved on since the draft began (saved from another browser/device), or the draft has no known baseline and differs, nothing is overwritten: the user chooses "Keep My Changes" or "Use Database Version".
- Blocks are matched by id, or by teacher + term + days + time + section/subject, so the same block never appears twice (including regenerated Advisory/HGP rows).
- If the database cannot be read, the local copy stays and is flagged "not yet confirmed saved". Nothing is cleared.
- "Clear this teacher" and "Clear All Teachers" delete the saved rows for that term first; if that fails, nothing is cleared locally. Other terms and other schools are never touched.
- A draft counts as unsaved only when its content differs from the saved baseline, not merely because one exists.

## Workload: merge, save and clear rules, round 2 (2026-10-09)
- Merge is block by block against the saved rows the local copy was built on (`workloadBaseRows`): a block edited only here is kept, a block changed only in the database is taken from the database, a block changed differently on both sides asks the user ("Keep My Changes" / "Use Database Version"). A draft entry identical to the database is dropped, and it is "unsaved" only when it really differs.
- A save is atomic per teacher (one transaction, saves for the same teacher run one after another) and idempotent: a retry replaces the same term rows, never adds. The term being saved is always replaced, even when its last block was removed.
- The browser retries 502/503/504, timeouts and network drops (0.5s, 1.5s, 3s). Validation answers such as 422 are shown as-is, without retrying.
- After the write the returned rows are checked against what was sent (re-read from the database if the reply does not prove it). Only then: success is shown, the teacher is marked validated, and the draft is cleared.
- Edits made while a save was running are compared against the rows that were sent and kept as the new draft; that teacher is not marked validated.

## Workload: restore prompt for a browser draft (2026-10-09)
- When a teacher + term is opened, the saved rows load first and are shown. A browser draft (localStorage `draft_workload_<id>`, or rows held only in the roster/school draft) is compared with them, ignoring order, generated ids and timestamps.
- Identical, or older with nothing extra: discarded silently, no prompt, no banner. Newer, or with added/changed blocks: a prompt (existing dialog style and labels) shows how many blocks would be added, changed or removed. Nothing is applied until the user confirms.
- Confirm: the draft's differences are overlaid on the saved rows (no duplicates; a saved block that overlaps a restored one is replaced) and the form is unsaved. Decline: the saved rows are shown and the draft stays in the browser; leaving the page still offers it through the unsaved-changes alert.
- Asked once per teacher + term per page load. If the saved rows cannot be read: no comparison, the draft is used and flagged "not yet confirmed saved", and the check repeats every 30 seconds and when the browser comes back online.
- "Newer" uses `workloadDraftSavedAt` (stamped on each edit) against the saved-at marker `workloadSavedAt`; older drafts without a stamp are judged by content alone.

## Unsaved changes on every editable page (2026-10-09)
- One shared guard (`services/dirtyGuard.js` + `hooks/useDirtyGuard.js`, also exported as `useUnsavedChangesGuard`). Each page registers its dirty flag, its own save and its discard. Pages with a register: School Profile, Roster, Personnel Profile, Deployment, Organized Classes, Designations, Workload.
- The dialog (Stay & Save / Save / Discard) opens for: Back to Dashboard, sidebar and node navigation, browser back/forward, logout, and teacher/term/tab switches inside a page. Tab close or refresh shows the browser's own prompt. It never opens when the page is clean and never twice for one navigation.
- Save runs the page's real save and waits for the server's confirmation (the school draft write is awaited and must be confirmed). If it fails (502, timeout, 422...), the dialog stays open with the server's message, the draft stays and the page stays unsaved. Discard drops the drafts; navigation then skips the auto-save so discarded work is not written back.
- The header Save button uses the same save function as the dialog. "Discard Changes" now also drops every page's draft before reloading, without a second browser prompt.
- Overload, Room QR, Request Center, Allowances, Node Map, Dashboard and Submission have no unsaved state (they save immediately or auto-sync), so they are not guarded. School Profile still asks for the typed CONFIRM from its header Save; the dialog's Save does not.

## Class sections: source of truth (2026-10-09)
Sections live in `esf7_regular_sections` (and sibling sned/als/aral/remedial tables), never in `school_drafts`. Stable key = row id, then school + canonical school year + grade level + section name. Canonical school year format is "SY 26-27". A draft is only an unsaved overlay and needs user confirmation to be applied.
