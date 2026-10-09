# DATA FLOW MAP

## Cloud draft save/load (updated 2026-10-08)
- Any edit -> AppContext marks dirty -> 3.5 s debounce -> IndexedDB `draft_<school>_<year>` -> `draftSaver.saveDraft` (one request at a time) -> `PUT /api/school/draft` (baseVersion) -> `school_drafts` upsert (version+1) -> response -> status "Saved".
- Journey-state save and delete-personnel draft update use the same queue (same table row, same version counter).
- Logout / forced logout -> `flushDrafts()` -> same PUT; logout proceeds only after success.
- Login -> `GET /api/school/draft` (DB, no cache) -> compare `version` with `localStorage insighted_draft_version_<school>_<year>`.

## Auth gate (2026-10-08)
- Request -> `apiAuthGate` (verify JWT, compare every school id in header/query/body/path with the token's school or the role's scope) -> controller. For school users the verified school is written to `x-school-id` so controller fallbacks (e.g. '108348') are never reached.
- Overload absence range ("Confirm & Log") -> app state `absences` -> school draft (PUT /api/school/draft). Tardiness DTR "Save DTR & Workload Impact" -> same state/draft AND POST /api/overload-late-undertime. Workload "Unlock & Duplicate" -> `personnel[].workloadRows` (term copied) -> school draft.

- Workload save (PUT/POST `/api/workload_rows/personnel/:id`) now reads the teacher's assigned grades (`esf7_personnel_employment.grade_levels_taught` / profile `raw_payload`) to reject new teaching rows when none are assigned.
- Workload page Save / Save & Validate / header Save: each awaits `POST /api/workloads/bulk` (esf7_workload_rows) per teacher, then updates local state + school draft. Browser copy `draft_workload_<id>` is cleared only after the server confirms.

- Workload page, selecting a teacher or term: `GET /api/workloads/personnel/:id/state?schoolId=&term=` returns the saved rows + version marker (`raw_payload.workloadSavedAt`); merged with the local draft per `services/workloadMerge.js`.
- Workload Save / Save & Validate / header Save: `POST /api/workloads/bulk` stamps a new `workloadSavedAt`; the editor is rebuilt from the rows the server returns.
- Delete one block: `DELETE /api/workloads/:id` (also stamps the marker). Clear this teacher (one term): `DELETE /api/workloads/personnel/:id/term/:term?schoolId=`. Clear All Teachers (one term): `DELETE /api/workloads/term-clear/school?schoolId=&term=`. Both also remove the term from the teacher's `raw_payload.workloadRows`.

## Login load vs save (2026-10-09)
Login (loadInitialData): READ only - GET school, draft, personnel, sections. No write until the user interacts and the draft differs from the loaded baseline. Saves: debounced auto-save / node "Complete" / explicit Save -> PUT /api/school/draft (dedupes, upserts school_drafts by school+year, then upserts esf7_personnel_node_status / esf7_school_node_status by key).

## Workload save -> time-allotment check
Save workload (Workload page -> POST/PUT /api/workloads/personnel/:id or /bulk) now also READS esf7_class_sections and other teachers' esf7_workload_rows for the same sections to check weekly caps before writing. No new writes.

## Allowance Disable button (2026-10-09)
Allowances page "Disable/Enable" -> POST /api/allowances/disable -> esf7_personnel_allowances.disabled_allowances (that person + school year only; grant flags untouched). Grant checkbox / column bulk still write has_* via /toggle (409 if disabled).

## Multigrade subject-grade (2026-10-09)
Workload Block Inspector "Grade Level of this Subject" -> row.subjectGradeLevel -> saved inside esf7_workload_rows.raw_payload via the normal workload save (no new column). Server allotment check reads it back from raw_payload.

## SDO School Head (2026-10-09)
Roster "Add/Edit SDO School Head" modal -> PUT /api/school-head-sdo -> esf7_school_head_sdo (school_id unique). Read on login (GET) into AppContext.sdoSchoolHead; used by the SF7 print modal, Validation Center principal name, roster save gate. Never written to esf7_personnel_profile.

## Disable Years (2026-10-09)
Personnel Profile > Learning Area > "Disable Years" -> person.disabledServiceYears -> saved by Save Changes via PUT /api/personnel/:id -> esf7_personnel_profile.disabled_service_years. Read back in the joined personnel GET; the Learning Area capacity (display and limits) uses gross years minus this value.
