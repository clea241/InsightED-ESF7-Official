# Electronic School Form 7 (eSF7) - school_drafts Dependency Audit & Decoupling Blueprint

**Date:** 2026-10-10  
**Audit Target:** `esf7_local` (PostgreSQL localhost:5432)  
**Scope:** Complete client-to-database persistence audit across all eSF7 pages, client services, Express controllers, ORM schemas (`server/drizzle/schema.ts`, `relations.ts`), background services, report generators, queue workers, and Redis buffers.  
**Execution Mode:** **Strictly Read-Only**. No database mutations, schema alterations, or code edits were executed during this audit.

---

## 1. Executive Summary

Historically, the eSF7 application stored school state in a single monolithic JSON document within the `school_drafts` table (`(school_id, school_year)` composite primary key). While substantial efforts have normalized data into 46 dedicated PostgreSQL tables (`esf7_*` and `overload_*`), **deep structural dependencies on `school_drafts` remain active across both frontend and backend systems**.

### Key Findings:
1. **Central Client Lifecycle (`AppContext.jsx`):**
   - On initial load (`loadInitialData`), the client unconditionally calls `GET /api/school/draft` (`AppContext.jsx:4509`) and uses `chooseDraftSource` to hydrate `schoolInfo`, `personnel`, `classSections`, `absences`, `workloadTransfers`, and `journey_state` from `school_drafts.payload`.
   - A global 3.5s debounced autosave effect (`AppContext.jsx:5818-5858`) continuously re-serializes the entire client state and pushes it back to `PUT /api/school/draft`, triggering an `UPSERT` on `school_drafts`.
   - Node completion transitions (`completeNode`, `AppContext.jsx:3625`) and personnel deletion (`AppContext.jsx:7168`) also directly trigger `saveDraft` (`PUT /api/school/draft`).
2. **Server-Side Fallbacks & Direct Draft Reads:**
   - **Reports (`esf7_xlsb.js` & `reports/index.js`):** Both `.xlsb` spreadsheet and PDF report generators query `school_drafts` **first** (`SELECT payload FROM school_drafts ...`, `esf7_xlsb.js:91`, `reports/index.js:474`). They only fall back to normalized database tables if the draft personnel array is empty.
   - **Overload Calculation (`services/overloadSync.js:73, 78`):** When computing overload hours and pay, `overloadSync` queries `school_drafts` and falls back to draft workloads and workload transfers whenever saved rows in `esf7_workload_rows` are missing, subsequently writing computed overload compensation into `overload_pay_and_reason`.
   - **Cascade Housekeeping (`controllers/class_sections/index.js` & `controllers/personnel/index.js`):** When deleting sections (`DELETE /api/sections/:id`, `POST /api/sections/regular/sync`) or personnel (`DELETE /api/personnel/:id`), the server actively reads, scrubs, and executes `UPDATE school_drafts SET payload = ...` to purge IDs from the JSON blob.
3. **Data at Risk of Loss (Draft-Only Keys):**
   - Multiple form fields, user verification statuses, and workflow states exist **exclusively** inside `school_drafts.payload` and have **no typed columns anywhere in the database schema**. If `school_drafts` is dropped without schema migration, these fields will be permanently destroyed.
   - Critical draft-only data includes: Principal certification details (`certifiedBy`, `certifiedSignature`, `certifiedAt`), deleted section tombstones (`deletedSectionIds`), teacher verification state (`changes`, `personalVerified`, `workloadVerified`), detailed DTR absence impact minutes (`missedSlotIds`, `missedTeachingMinutes`, `teachingImpactMinutes`), and workflow journey state (`journey_state`).

---

## 2. Master Page-to-Table Audit Matrix

The table below catalogs every eSF7 page component, its client routing, API calls, server endpoints, active `school_drafts` read/write touchpoints (with exact `file:line` references), designated target tables, and persistence status:
- **Confirmed:** Code already writes to and/or reads from this normalized table in production.
- **Inferred:** Table, foreign key, or columns exist in `schema.ts` / `relations.ts` matching page fields, but the page currently relies on drafts or lacks direct route wiring.

| # | Page Component | Client Route / Query View | API Calls & Server Route | Current `school_drafts` Reads/Writes (`file:line`) | Designated Normalized Tables | Status |
|---|---|---|---|---|---|---|
| 1 | **SchoolProfile.jsx** | `?view=school` | `api.updateCurricularConfig` -> `POST /api/school/curricular-config` | **Read:** `AppContext.jsx:4509` (`GET /api/school/draft` loads `payload.schoolInfo`). `SchoolProfile.jsx:165` reads local cache `insighted_school_curricular_config_*`.<br>**Write:** `AppContext.jsx:5858` (debounced `PUT /api/school/draft`). `AppContext.jsx:3625` (node completion). `SchoolProfile.jsx:327` writes local cache. | `esf7_school_profile`<br>`esf7_school_node_status`<br>`esf7_school_head_sdo` | **Confirmed** (`esf7_school_profile` written by `/curricular-config`) |
| 2 | **Roster.jsx** | `?view=roster` | `api.getPersonnel` -> `GET /api/personnel`<br>`api.addPersonnel` -> `POST /api/personnel`<br>`api.saveSdoSchoolHead` -> `PUT /api/school-head-sdo`<br>`api.deletePersonnel` -> `DELETE /api/personnel/:id` | **Read:** `AppContext.jsx:4509` (loads `payload.personnel`, `deletedPersonnelIds`). `Roster.jsx:628, 648` filters on `isDraft`.<br>**Write:** `Roster.jsx:560` (`commitDraftPersonnel`). `AppContext.jsx:7168` (calls `saveDraft` on delete). `server/controllers/personnel/index.js:4417, 4481` (server scrubs `school_drafts` on delete). | `esf7_personnel_profile`<br>`esf7_personnel_employment`<br>`esf7_school_head_sdo`<br>`esf7_deleted_personnel` | **Confirmed** (CRUD endpoints already target `esf7_personnel_*`) |
| 3 | **PersonnelProfile.jsx** | `?view=profile` | `api.updatePersonnel` -> `PUT /api/personnel/:id`<br>`api.updateEmployment` -> `PUT /api/employment/:id`<br>`api.updateQualifications` -> `PUT /api/qualifications/:id`<br>`api.updateTrainings` -> `PUT /api/trainings/:id`<br>`api.updateLearningAreas` -> `PUT /api/learning-areas/:id`<br>`POST /api/extra-tasks` | **Read:** `AppContext.jsx:4509` (loads degreeRows, neapTrainings, etc.). `PersonnelProfile.jsx:1332` reads `draft_personnel_${id}`.<br>**Write:** `PersonnelProfile.jsx:1289` writes `draft_personnel_${id}`. `AppContext.jsx:6650` (`savePersonnelChanges` triggers debounced `PUT /api/school/draft`). | `esf7_personnel_profile`<br>`esf7_personnel_employment`<br>`esf7_perssonel_educ`<br>`esf7_personnel_ld_trainings`<br>`esf7_personnel_learning_areas`<br>`esf7_personnel_extra_tasks` | **Confirmed** (Individual controllers persist each sub-profile) |
| 4 | **Designations.jsx** | `?view=designation` | `api.updateEmployment` -> `PUT /api/employment/:id`<br>`POST /api/designations`<br>`POST /api/extra-tasks` | **Read:** `AppContext.jsx:4509` (loads `p.designation`, `p.ancillary_*`, `administrativeRows`).<br>**Write:** `Designations.jsx:1375` calls `confirmServerDraftSaved()`. Updates `personnel` triggering `PUT /api/school/draft`. | `esf7_personnel_designations`<br>`esf7_personnel_extra_tasks`<br>`esf7_admin_task`<br>`esf7_related_task` | **Confirmed** (`esf7_personnel_designations` & `extra_tasks` active; `admin/related_task` mirror) |
| 5 | **OrganizedClasses.jsx** | `?view=classes` | `api.syncRegularSections` -> `POST /api/sections/regular/sync`<br>`api.addSection` -> `POST /api/sections/regular`<br>`api.deleteSection` -> `DELETE /api/sections/:id` | **Read:** `AppContext.jsx:4509` (loads `classSections`, `deletedSectionIds`). `AppContext.jsx:5115-5138` checks diff against draft.<br>**Write:** Adding/editing sections updates `classSections`, triggering debounced `saveDraft` (`PUT /api/school/draft`). `server/controllers/class_sections/index.js:702, 733, 1430, 1458` scrubs `school_drafts`. | `esf7_regular_sections`<br>`esf7_sned_sections`<br>`esf7_als_sections`<br>`esf7_aral_sections`<br>`esf7_remedial_enrichment_sections` | **Confirmed** (All 5 tables written by `class_sections/index.js`) |
| 6 | **Workload.jsx** | `?view=workload` | `api.saveWorkloadBatch` -> `POST /api/workloads/bulk`<br>`api.clearTeacherTermWorkload` -> `DELETE /api/workloads/personnel/:id/term/:term`<br>`api.clearSchoolTermWorkload` -> `DELETE /api/workloads/term-clear/school`<br>`api.getWorkloadState` -> `GET /api/workloads/personnel/:id/state` | **Read:** `AppContext.jsx:4509` (loads `personnel[].workloadRows`). `Workload.jsx:77` checks `draft_workload_${id}`. `AppContext.jsx:5014-5060` overlay merge.<br>**Write:** `Workload.jsx` writes `localStorage.setItem(draft_workload_${id})`. After `/bulk` save, updates `AppContext` triggering `PUT /api/school/draft`. | `esf7_workload_rows`<br>`esf7_shs_workload_rows`<br>`esf7_term_status` | **Confirmed** (All 3 tables written by `workload_rows` controller) |
| 7 | **Deployment.jsx** | `?view=deployment` | `api.updateEmployment` -> `PUT /api/employment/:id`<br>`api.createRequest` -> `POST /api/requests` | **Read:** `AppContext.jsx:4509` (loads deploymentStatus, hiringArrangement). `Deployment.jsx:41` reads `draft_deployment_${id}`.<br>**Write:** `Deployment.jsx` writes local draft. Triggers `savePersonnelChanges` -> debounced `PUT /api/school/draft`. | `esf7_personnel_employment`<br>`esf7_personnel_profile`<br>`esf7_requests` | **Confirmed** (`esf7_personnel_employment` & `esf7_requests` active) |
| 8 | **Overload.jsx** | `?view=overload` | `api.saveWorkImmersionBatch` -> `POST /api/work-immersion/batch`<br>`api.saveOverloadReasons` -> `POST /api/overload-reasons`<br>`POST /api/transfers`<br>`POST /api/absences`<br>`POST /api/overload-late-undertime`<br>`POST /api/no-work` | **Read:** `AppContext.jsx:4509` (loads `workloadTransfers`, `absences`). `Overload.jsx:863` reads `draft_workload_${id}`.<br>**Write:** `AppContext.jsx:8446, 8516` marks draft dirty and pushes `PUT /api/school/draft`.<br>**Server Read:** `services/overloadSync.js:73, 78` queries `school_drafts` to compute overload! | `overload_absences`<br>`overload_pay_and_reason`<br>`esf7_workload_transfer`<br>`overload_no_work`<br>`overload_late`<br>`esf7_work_immersion`<br>`salary_matrix` | **Confirmed** (All tables active, but client was omitting direct absence/transfer API calls in favor of drafts) |
| 9 | **Allowances.jsx** | `?view=allowances` | `api.toggleAllowance` -> `POST /api/allowances/toggle`<br>`api.setAllowanceDisabled` -> `POST /api/allowances/disable`<br>`api.bulkToggleAllowances` -> `POST /api/allowances/bulk` | **Read:** `AppContext.jsx:5368` loads `activeDraft.allowancesMap` into state if present.<br>**Write:** `allowancesMap` state included in draft payload on `PUT /api/school/draft`. | `esf7_personnel_allowances` | **Confirmed** (Fully implemented in `allowances/index.js`) |
| 10 | **ValidationCenter.jsx** | `?view=validation` | `api.getSchoolValidation` -> `GET /api/validation`<br>`api.resubmitSchoolValidation` -> `POST /api/validation`<br>`api.submitSchoolWorkload` -> `POST /api/submissions`<br>`api.downloadESF7XLSB` -> `GET /api/reports/esf7-xlsb`<br>`api.downloadESF7PDF` -> `GET /api/reports/esf7-pdf`<br>`api.deleteSchoolDraft` -> `DELETE /api/school/draft` | **Read:** `ValidationCenter.jsx:123-140` falls back to `localDraft.personnel` and `localDraft.classSections`. `reports/esf7_xlsb.js:91` and `reports/index.js:474` read `school_drafts` first!<br>**Write:** `ValidationCenter.jsx:657` calls `deleteSchoolDraft` on reset or post-submit. | `esf7_validation`<br>`esf7_submission_queue`<br>`esf7_po3_corrections`<br>`esf7_hrmo_corrections` | **Confirmed** (`esf7_validation` & queue active; reports read drafts first) |
| 11 | **Submission.jsx** | `?view=submission` | Navigates to `ValidationCenter` / triggers submission | Reads validation issues from context. No direct draft queries. | `esf7_submission_queue`<br>`esf7_school_node_status` | **Confirmed** |
| 12 | **RoomQR.jsx** | `?view=room-qr` | `api.getPendingRoomSubmissions` -> `GET /api/room-profiling/pending`<br>`api.acceptRoomSubmissions` -> `POST /api/room-profiling/accept`<br>`api.saveProfilingSnapshot` -> `POST /api/room-profiling/snapshot`<br>`api.syncRoomRoster` -> `POST /api/room-profiling/sync-roster` | **Read:** `RoomQR.jsx:57-61` reads `draft_personnel_${id}` and `draft_learning_areas_${id}`.<br>**Write:** Lines 954, 1161 clear/update local drafts; approval calls `savePersonnelChanges` triggering `PUT /api/school/draft`. | `esf7_personnel_submission`<br>`esf7_personnel_submission_archive`<br>`esf7_profiling_snapshots`<br>`esf7_room_roster_cache`<br>`esf7_room_submissions_staging`<br>`esf7_personnel_profile` | **Confirmed** (Accept route writes normalized personnel tables) |
| 13 | **RoomProfiling.jsx** | `?view=room-profiling` | `api.verifyRoomPasscode` -> `POST /api/room-profiling/verify-passcode`<br>`api.submitRoomProfiling` -> `POST /api/room-profiling/submit` | **Read:** `RoomProfiling.jsx:1491` reads `draft_personnel_${id}` from localStorage.<br>**Write:** `RoomProfiling.jsx:1600` caches draft to localStorage; submit writes to `esf7_personnel_submission` (NOT `school_drafts`). | `esf7_personnel_submission`<br>`esf7_passcode_lockout` | **Confirmed** |
| 14 | **RequestCenter.jsx** | `?view=requests` | `api.createRequest` -> `POST /api/requests`<br>`api.respondToRequest` -> `POST /api/requests/:id/respond` | No direct draft touchpoints. Reads requests via `api.getRequests()`. | `esf7_requests`<br>`esf7_clustered_ghost_sync` | **Confirmed** |
| 15 | **Dashboard.jsx** | `?view=dashboard` | `api.getDashboardStats` -> `GET /api/dashboard/stats` | **Read:** Reads `schoolInfo` and `personnel` from `AppContext` (hydrated from drafts).<br>**Write:** `Dashboard.jsx:147` calls `flushDrafts()` before print. | `esf7_school_profile`<br>`esf7_personnel_profile`<br>`esf7_regular_sections`<br>`esf7_school_node_status` | **Confirmed** (`GET /stats` aggregates normalized tables) |
| 16 | **NodeMap.jsx** | `?view=nodemap` | None (reads context) | **Read:** Reads `journeyState` from `AppContext` (hydrated from `activeDraft.journey_state`). | `esf7_school_node_status` | **Confirmed** (`esf7_school_node_status` holds milestone snapshots) |
| 17 | **Login.jsx** | `/` (auth gate) | `api.login` -> `POST /api/auth/login` | None direct. Triggers `AppContext.loadInitialData` upon successful login. | `user_schoolhead` (auth pool) | **Confirmed** |
| 18 | **Landing.jsx** | `?view=landing` | None | None | None (static landing UI) | **Confirmed** |

---

## 3. Server-Side Call-Site Inventory (`school_drafts`)

Static grep analysis confirmed by AST scanning identified **185 total occurrences** of `school_drafts` across the server. Grouped by tier:
- **Controllers & Routes:** 25 call sites
- **Services:** 2 call sites
- **Scripts, Seeds, and Migrations:** 119 call sites
- **Tests:** 34 call sites
- **Schema & DDL:** 5 call sites

### 3.1. Express Controllers & Route Handlers
1. **`server/controllers/schools/index.js`:**
   - `L509`: Checks `information_schema.columns` for `version` column on `school_drafts`.
   - `L535`: `SELECT payload, updated_at, version FROM school_drafts WHERE school_id = $1 AND school_year = $2` (`GET /api/school/draft`).
   - `L1537`: `SELECT payload FROM school_drafts WHERE school_id = $1 AND school_year = $2` (`PUT /api/school/draft` merge protection).
   - `L1930-1934`: `INSERT INTO school_drafts (school_id, school_year, payload, updated_at, version) ... ON CONFLICT DO UPDATE SET payload = EXCLUDED.payload, version = school_drafts.version + 1` (`PUT /api/school/draft`).
   - `L1941`: `SELECT version, updated_at FROM school_drafts ...` (`PUT /api/school/draft`).
   - `L1961`: Fallback `INSERT INTO school_drafts` without version.
   - `L2017`: `DELETE FROM school_drafts WHERE school_id = $1 AND school_year = $2` (`DELETE /api/school/draft`).
2. **`server/controllers/class_sections/index.js`:**
   - `L702 & L733`: In `POST /api/sections/regular/sync`: reads `school_drafts` and executes `UPDATE school_drafts SET payload = $1 ...` to purge `deletedIds` from `payload.classSections` and append to `payload.deletedSectionIds`.
   - `L1430 & L1458`: In `DELETE /api/sections/:id`: executes cross-pool draft query and updates `school_drafts` payload to scrub the deleted section ID.
3. **`server/controllers/personnel/index.js`:**
   - `L4417 & L4481`: In `DELETE /api/personnel/:id`: reads `school_drafts`, filters `payload.personnel`, unassigns `sec.advisorId` in `payload.classSections`, appends to `payload.deletedPersonnelIds`, and executes `UPDATE school_drafts SET payload = $1 ...`.
4. **`server/controllers/reports/esf7_xlsb.js`:**
   - `L91`: In `GET /api/reports/esf7-xlsb`: `SELECT payload FROM school_drafts WHERE school_id = $1 OR school_id = $2 ORDER BY updated_at DESC LIMIT 1`. Populates school info and personnel list directly from the draft, falling back to database tables only if draft personnel is empty.
5. **`server/controllers/reports/index.js`:**
   - `L474`: In `GET /api/reports/esf7-pdf`: `SELECT payload FROM school_drafts WHERE school_id = $1 OR school_id = $2 ORDER BY updated_at DESC LIMIT 1`. Reads draft payload first; database query is a secondary fallback.
6. **`server/controllers/room_profiling/index.js`:**
   - `L1955`: Documented removal of legacy query on nonexistent `draft_data` column.

### 3.2. Background Services & Workers
1. **`server/services/overloadSync.js`:**
   - `L73 & L78`: `SELECT * FROM school_drafts WHERE school_id = $1 ...`.
   - `L172-200`: If a teacher has 0 rows in `esf7_workload_rows` / `esf7_shs_workload_rows`, `overloadSync` falls back to `draftPersonnel.workloadRows` from `school_drafts` and merges `draftTransfers` into `allTransfers`. It then persists calculated compensation into `overload_pay_and_reason` based on uncommitted draft data.
2. **`server/queue_worker.js`:**
   - Line 3125 calls `overloadSync.syncSchoolOverload(...)`. While `queue_worker.js` itself writes exclusively to normalized tables (`esf7_school_profile`, `esf7_personnel_profile`, `esf7_regular_sections`, `esf7_workload_rows`, etc.), its invocation of `overloadSync` indirectly reads `school_drafts`.
3. **Redis Buffer (`server/services/redisQueue.js` & `run_redis_worker.js`):**
   - **Zero references.** The Redis queue buffers submission jobs (`esf7_submission_queue`) and health diagnostics. It does not buffer or touch `school_drafts`.

### 3.3. Seeds & Maintenance Scripts
- `server/seed_test_school.js:27`: Deletes test school `199999` from `school_drafts`.
- `server/scratch_seed_test_account.js:42`: Deletes test school from `school_drafts`.
- `server/register_user_199888.js`: Inspects `school_drafts`.
- `server/truncate_esf7_tables.js:21`: Lists `school_drafts` among tables wiped during test database resets.
- `server/scripts/disaggregate_school_drafts.js`: Historical migration script parsing `school_drafts.payload` into normalized tables.

---

## 4. Draft-Only Data Requiring Migration Before Removal

An exhaustive scan across all 14,954 rows in `school_drafts.payload` identified fields that exist **only within the JSON blob** and have **no typed columns** in any active table. If `school_drafts` is decommissioned without schema expansion or migration, this data will be unrecoverable:

```
school_drafts.payload (Top-Level Keys)
├── absences (14,803 rows)
├── classSections (14,954 rows)
├── deletedPersonnelIds (294 rows)
├── journey_state (14,798 rows)
├── lastUpdated (14,954 rows)
├── personnel (14,954 rows)
├── schoolInfo (14,804 rows)
├── sections (33 rows)
├── sectionsCleared (1 row)
└── workloadTransfers (14,803 rows)
```

### 4.1. Unmapped Fields by Domain

#### 1. School Certification (`payload.schoolInfo`)
- **Fields:** `certifiedBy`, `certifiedSignature`, `certifiedAt`
- **Current State:** Stored only in `school_drafts.payload.schoolInfo` during drafting. They only reach the database if the school submits officially (`esf7_submission_queue.certified_by`, `esf7_submission_queue.signature`). In `esf7_school_profile`, there are **no columns** for certification name, signature data URL, or timestamp.
- **Migration Need:** Add `certified_by VARCHAR(255)`, `certified_signature TEXT`, and `certified_at TIMESTAMPTZ` to `esf7_school_profile`.

#### 2. Granular Special & Inclusive Programs (`payload.schoolInfo`)
- **Fields:** `elemSpecialPrograms`, `elemInclusivePrograms`, `jhsSpecialPrograms`, `jhsInclusivePrograms`, `shsInclusivePrograms`, `subjectsConfig`
- **Current State:** `esf7_school_profile` has boolean flags (`has_elem_special_programs`, etc.) and general JSONB columns (`special_programs`), but granular program arrays configured in the School Profile modal are saved inside draft payload and `raw_payload`.
- **Migration Need:** Ensure `esf7_school_profile.special_programs` and program JSONB columns store full arrays upon save.

#### 3. Section Deletion Tombstones (`payload.deletedSectionIds`)
- **Fields:** `deletedSectionIds` (string array of IDs)
- **Current State:** Unlike personnel (which uses `esf7_deleted_personnel`), sections have **no deleted archive table**. Deleted section IDs are tracked solely in `school_drafts.payload.deletedSectionIds` to prevent historical sections from re-appearing during sync.
- **Migration Need:** Create table `esf7_deleted_sections (id VARCHAR(255), school_id TEXT, school_year TEXT, deleted_at TIMESTAMPTZ)` or rely on clean database-first section management.

#### 4. Section Advisory Metadata (`payload.classSections[]`)
- **Fields:** `adviserRemarks`, `advisoryMinutes` (default 300), `hgpMinutes` (default 60)
- **Current State:** `esf7_regular_sections` stores `section_name`, `grade_level`, `adviser_id`, learner counts, and `section_type`. It does not have typed columns for `adviser_remarks`, `advisory_minutes`, or `hgp_minutes` (they reside in `raw_payload`).
- **Migration Need:** Preserve in `esf7_regular_sections.raw_payload` or add explicit columns.

#### 5. Teacher Verification & Profiling Audit (`payload.personnel[]`)
- **Fields:** `changes` (object diff from QR profiling), `personalVerified` (boolean), `workloadVerified` (boolean), `harvested_at`, `submitted_at`, `certificationRows`
- **Current State:** When teachers profile via Faculty Room QR, their self-verified status (`personalVerified`, `workloadVerified`) and field changes (`changes`) are merged into `school_drafts.payload.personnel[]`. `esf7_personnel_profile` stores identity columns but lacks verification flags.
- **Migration Need:** Add `personal_verified BOOLEAN DEFAULT FALSE` and `workload_verified BOOLEAN DEFAULT FALSE` to `esf7_personnel_profile`.

#### 6. Detailed Absence Impact & Tardiness DTR (`payload.absences[]`)
- **Fields:** `missedSlotIds`, `missedTeachingMinutes`, `scheduledTeachingMinutes`, `teachingImpactMinutes`, `total_dtr_deficit_minutes`, `actualRenderedMinutes`, `dailyOverloadEarned`
- **Current State:** `overload_absences` has typed columns only for `id`, `personnel_id`, `school_id`, `school_year`, `start_date`, `end_date`, `leave_type`, and `total_days`. DTR deficit minutes and timetable slot impact are stored in `raw_payload` or solely within draft `payload.absences`.
- **Migration Need:** Ensure `overload_absences.raw_payload` captures full DTR metrics, or add `missed_teaching_minutes NUMERIC` to `overload_absences`.

#### 7. User Workflow Progress (`payload.journey_state`)
- **Fields:** `unlockedNodes`, `completedNodes`, `currentNode`
- **Current State:** `esf7_school_node_status` records completed milestone nodes (`status: "COMPLETED"`). However, the specific UI navigation state (which screen the user is currently editing and custom unblocked nodes) lives only in `school_drafts.payload.journey_state`.
- **Migration Need:** Store active tab / journey state in `esf7_school_node_status.journey_state` JSONB.

---

## 5. Text-Only Action Items: Changes Required per Page to Decouple from drafts

To achieve complete decoupling from `school_drafts`, the application must transition from a "Draft-First with DB Fallback" pattern to a **"Database-First with Local-First IndexedDB Cache"** pattern.

### 5.1. Global Infrastructure (`AppContext.jsx` & Client Services)
1. **Retire Cloud Draft Endpoints in Initial Boot (`AppContext.jsx:4509`):**
   - Remove `api.getSchoolDraft()` from `loadInitialData`.
   - Replace with parallel direct queries to designated endpoints: `api.getSchoolProfile()`, `api.getPersonnel()`, `api.getSections()`, `api.getTransfers()`, `api.getAbsences()`, `api.getAllowances()`, `api.getNodeStatus()`.
   - Treat database records as the absolute baseline; use local IndexedDB purely as an offline write-ahead buffer (not a cloud draft mirror).
2. **Decommission Central Autosave PUT (`AppContext.jsx:5818`):**
   - Remove the debounced `PUT /api/school/draft` effect that serializes the monolithic state.
   - Replace with page-scoped debounced autosaves that target each page's specific API route (`/curricular-config`, `/sections/regular/sync`, `/workloads/bulk`, `/personnel/:id`).
3. **Refactor Server Controllers to Drop Draft Scrubbing:**
   - In `class_sections/index.js` (lines 702, 733, 1430, 1458), remove SQL queries updating `school_drafts`.
   - In `personnel/index.js` (lines 4417, 4481), remove SQL queries updating `school_drafts`.

### 5.2. School Profile (`SchoolProfile.jsx`)
1. **Read Path:** Ensure `SchoolProfile.jsx` reads directly from `schoolInfo` populated by `GET /api/school` (from `esf7_school_profile`), ignoring any local `insighted_school_curricular_config_*` draft if the database record is newer.
2. **Write Path:** Maintain `api.updateCurricularConfig` (`POST /api/school/curricular-config`). Add columns `certified_by`, `certified_signature`, and `certified_at` to `esf7_school_profile` so school head sign-off is committed to `esf7_school_profile`.
3. **Decoupling:** Remove `completeNode` cloud draft save (`AppContext.jsx:3625`); commit completion strictly to `POST /api/node-status` (`esf7_school_node_status`).

### 5.3. Faculty & Staff Roster (`Roster.jsx`)
1. **Read Path:** Hydrate faculty exclusively from `GET /api/personnel/joined` (`esf7_personnel_profile` + child tables).
2. **Add Personnel:** When clicking "Add Personnel", create the record via `POST /api/personnel` immediately with standard defaults, removing the transient `isDraft: true` local state flag.
3. **Delete Personnel:** `deletePersonnel` must call `DELETE /api/personnel/:id` directly; remove the IndexedDB `draft_personnel_*` cleanup and cloud draft save in `AppContext.jsx:7168`.

### 5.4. Personnel Profiling (`PersonnelProfile.jsx`)
1. **Read Path:** Load profiling data from `GET /api/personnel/:id` (`esf7_personnel_profile`, `esf7_personnel_employment`, `esf7_perssonel_educ`, `esf7_personnel_ld_trainings`, `esf7_personnel_learning_areas`).
2. **Local Caching:** Limit `localStorage.getItem("draft_personnel_${id}")` to active unsaved form keystrokes in the current browser tab. Discard local draft once "Save Changes" returns 200 OK from `PUT /api/personnel/:id`.
3. **Decoupling:** Eliminate `savePersonnelChanges` calls to `PUT /api/school/draft`.

### 5.5. Personnel Designations (`Designations.jsx`)
1. **Read Path:** Query `esf7_personnel_designations` and `esf7_personnel_extra_tasks` via dedicated endpoint `GET /api/designations?schoolId=`.
2. **Write Path:** Save directly via `POST /api/designations` and `POST /api/extra-tasks`.
3. **Decoupling:** Remove `confirmServerDraftSaved()` check at `Designations.jsx:1375`.

### 5.6. Organized Classes & Sections (`OrganizedClasses.jsx`)
1. **Read Path:** Populate exclusively from `GET /api/sections` (`esf7_regular_sections`, `esf7_sned_sections`, `esf7_als_sections`, `esf7_aral_sections`, `esf7_remedial_enrichment_sections`).
2. **Conflict Resolution:** Remove the "Restore unsaved section changes?" prompt that compares database rows against `activeDraft.classSections` (`AppContext.jsx:5128`).
3. **Write Path:** Retain `POST /api/sections/regular/sync` for bulk section changes. Server-side, remove draft scrubbing from lines 702 and 733.

### 5.7. Faculty Workload & Timetable (`Workload.jsx`)
1. **Read Path:** Read teacher workloads strictly from `GET /api/workloads/personnel/:id/state` (`esf7_workload_rows` and `esf7_shs_workload_rows`).
2. **Write Path:** Retain `POST /api/workloads/bulk`. On successful response, rebuild the editor grid from the returned database records.
3. **Decoupling:** Stop updating `personnel[].workloadRows` inside `AppContext` to prevent triggering the global draft autosave. Local storage `draft_workload_${id}` should only store ephemeral dirty edits and be cleared immediately upon server 200 OK.

### 5.8. Faculty Deployment (`Deployment.jsx`)
1. **Read Path:** Read `deployment_status`, `hiring_arrangement`, and `assigned_schools` from `esf7_personnel_employment`.
2. **Write Path:** Save changes directly through `PUT /api/employment/:id`. Remove local `draft_deployment_${id}` storage.

### 5.9. Teaching Overload & Payroll (`Overload.jsx`)
1. **Absences Save Path:** Rewire `addPersonnelAbsence` to invoke `POST /api/absences` (`overload_absences`) and `POST /api/overload-late-undertime` immediately instead of queuing in `AppContext.absences` and `school_drafts`.
2. **Transfers Save Path:** Rewire `addWorkloadTransfer` to call `POST /api/transfers` (`esf7_workload_transfer`) immediately instead of queueing in `school_drafts`.
3. **Server Overload Computation:** In `server/services/overloadSync.js` (lines 73, 78, 172-200), **remove all queries to `school_drafts`**. If `esf7_workload_rows` has 0 rows for a teacher, compute overload as 0 or flag "No saved timetable found" rather than reading uncommitted draft JSON.

### 5.10. Personnel Allowances (`Allowances.jsx`)
1. **Read Path:** Load allowances via `GET /api/allowances?schoolId=` (`esf7_personnel_allowances`).
2. **Write Path:** Use existing direct endpoints (`/toggle`, `/disable`, `/bulk`).
3. **Decoupling:** Remove `allowancesMap` hydration from `activeDraft.allowancesMap` in `AppContext.jsx:5368`.

### 5.11. Validation Center & Report Generators (`ValidationCenter.jsx`, `reports/`)
1. **Validation Checks:** Run validation rules strictly against database records fetched from `/api/validation` and normalized tables. Remove IndexedDB `localDraft` fallback at `ValidationCenter.jsx:123-140`.
2. **XLSB Report Generation:** In `server/controllers/reports/esf7_xlsb.js:91`, remove the `SELECT payload FROM school_drafts` block. Generate the spreadsheet directly from `esf7_school_profile`, `esf7_personnel_profile`, and `esf7_workload_rows`.
3. **PDF Report Generation:** In `server/controllers/reports/index.js:474`, remove the `SELECT payload FROM school_drafts` block. Render the PDF directly from normalized tables.
4. **Post-Submission Cleanup:** In `ValidationCenter.jsx:657`, replace `api.deleteSchoolDraft` with a call to mark submission status in `esf7_validation` and `esf7_school_node_status`.

---

## 6. Verification Evidence & Guarantees

1. **Database Allowlist Conformance:** All inspection queries were routed to loopback `localhost:5432` on database `esf7_local`. Zero queries touched external databases or other clusters.
2. **Non-Destructive Read-Only Guarantee:** All database sessions used `SET default_transaction_read_only = on`. Zero `INSERT`, `UPDATE`, `DELETE`, `ALTER`, or `DROP` statements were executed.
3. **Repository Integrity:** No application source code, configuration files, or database schemas were modified during this audit.
4. **Project Alignment:** All page filenames, URL view parameters, API endpoints, table names, and column identifiers cited in this report were verified directly against the live repository.
