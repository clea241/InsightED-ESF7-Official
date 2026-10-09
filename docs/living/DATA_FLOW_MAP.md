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
- Workload page Save / Save & Validate: each awaits `POST /api/workloads/bulk` (esf7_workload_rows) per teacher, then updates local state + school draft (the header "Save & Continue" does not yet write workload rows). Browser copy `draft_workload_<id>` is cleared only after the server confirms.
