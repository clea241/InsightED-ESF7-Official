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

## Time allotment per subject (shared/scheduleRules.js)
- Regular/multigrade: min 40 min per class (sections containing G1 or G2), no daily cap, 480 min/week per subject.
- Special Curricular Programs: min 40 min, max 120 min/day per subject, 600 min/week per subject.
- Enforced in Validation Center (client) and on workload save (server, 422). Message names the rule + "coordinate with CID".

## Personnel category, fund source, allowances, multigrade (2026-10-09)
- Category comes from the position lookup (`POSITION_OPTIONS_BY_CATEGORY` client, `CANONICAL_POSITIONS_BY_CATEGORY` server). Librarian, School Librarian, College Librarian moved Non-Teaching -> Teaching-Related; Guidance positions were already Teaching-Related.
- Related-Teaching staff (any position in that category, incl. Head Teacher, Librarian, Guidance) get workload from Classes Organized: grade levels of sections they advise count as their assigned grades (unlocks plotting). Never decided by title text.
- Fund source NATIONAL is allowed for CONTRACTUAL and JOB ORDER/CONTRACT OF SERVICE (list: `NATIONAL_FUND_ELIGIBLE_NATURES`, shared/scheduleRules.js). Other non-permanent natures stay local-fund only.
- An allowance can be disabled per personnel + school year (e.g. Special Hardship). Disabled = cannot be granted, bulk toggles skip it, compliance "at least one allowance" ignores it. Stored grant is kept; re-enabling restores it. Default: nothing disabled.
- Multigrade section: each grade level can carry its own subject (`subjectGradeLevel` on the workload row). Different grades in one section are not a time overlap or duplicate-subject conflict; same grade + same subject by two teachers still is. Min/weekly-max allotment is counted per grade level + subject (shared/timeAllotment.js, enforced on save server-side).

## School head (Rows 14/16, 2026-10-09)
- A school may list several Principals; exactly one is the school head (Roster toggle -> `is_school_head`). Server blocks a second head on create and update; migration adds a partial unique index per school. Roster save is blocked with zero heads (unless an SDO head exists); Validation Center errors when 2+ Principals and none designated.
- If the roster has no designated head, the Roster shows "Add SDO School Head" (name, email, position title; table `esf7_school_head_sdo`, one per school, not in the roster). Reports/SF7 print and Validation Center principal name use roster head first, then the SDO record (`shared/schoolHead.js`). The SDO record is refused (409) while the roster has a head.
- SCHOOL PRINCIPAL II and MASTER TEACHER I already exist in the position lookups (client + server); no change needed.

## Rows 17-22 (2026-10-09)
- Learning Area years available = years since first service day minus `disabledServiceYears` (personnel record, default 0, whole number 0-70). Cannot disable so many that recorded subject-years exceed what remains. Existing records unchanged until used.
- Department Head per key stage is required only if JHS or SHS is offered (`requiresDepartmentHead`, shared/schoolLevel.js). Elementary-only schools are not blocked. Unknown/empty offering keeps the old (required) behavior.
- School Principal positions (shared/personnelClass.js) stay Related-Teaching but get no Classes-Organized workload: no advisory/section rows are generated and organized-class grades are not counted.
- JHS/SHS sections: two classes may share a time slot in the By-Section builder when subjects differ; a clash is the same subject repeated, or the same teacher double-booked. Elementary sections keep one class per slot. Room double-booking is not checked (workload rows carry no room).

## Workload list paging (2026-10-10)
- `GET /api/workloads` never returns more than 500 rows per call (default 100). Rows are ordered oldest first, ties broken by id. A caller continues with the `X-Next-Cursor` header value; no header means last page. The total is sent only with the first page.

## Workload row storage rule (2026-10-10)
- A workload row's schedule fields live in typed columns; any other field the screen sends (task, row type, category, day schedule, track/strand, minutes) is kept in `extras` and returned unchanged. A value that differs from its typed column is kept in `extras` instead of being discarded. Rows saved before the change are folded into `extras` the first time they are edited if the backfill has not reached them.

## Extras rule for the other six tables (2026-10-10)
- Same rule as workload rows: only fields with no typed column, or whose value differs from the typed column, are kept in `extras` and returned as before. A section adviser who has no profile row yet is still kept in `extras` (the adviser foreign key cannot hold it) and shown as before.
