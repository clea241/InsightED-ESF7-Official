---
name: local-offline-sync-architect
description: Master agent skill for DepEd eSF7 Local-First Offline Emergency Buffering, Online Server Priority, and Transparent Auto-Merge Synchronization.
---

# Local Offline Sync Architect Knowledge Base

## 1. Core Paradigm: Online Priority vs. Offline Buffer

The system operates strictly under two mutually exclusive runtime states:

| Environment Condition | State | Data Source of Truth | LocalDB / IndexedDB Role |
| :--- | :--- | :--- | :--- |
| **Internet Connected & Server Healthy** | **ONLINE** | **Central Database API (`esf7_*`)** | Dormant (No reads, no silent overwrites) |
| **Disconnected (`!navigator.onLine` or HTTP 502/504)** | **OFFLINE** | **Browser IndexedDB Buffer** | Active Emergency Buffer (Writes to Outbox) |

---

## 2. The Clean Flow: Online Direct Load + Auto-Merge on Reconnect

### A. Initial Load / Login (Online)
1. **Always Fetch Server First**: The application immediately fetches fresh data directly from the central database (`/api/schools/profile`, `/api/personnel`, `/api/sections`, etc.).
2. **Scan for Offline Buffer (Outbox)**: The application inspects if any un-synced offline actions (`IndexedDB.outbox_queue`) were recorded on this device during a previous offline period.
3. **Automatic Reconnection Merge**:
   - If an un-synced outbox exists, the client **automatically overlays the user's offline work onto the server baseline**.
   - It fires an immediate background batch sync to the API to commit the changes to PostgreSQL.
   - Upon successful commit confirmation from the server, the local outbox entry is **permanently purged** (`removeOutboxEntry`).
   - A non-intrusive status toast notifies the user: *"Synced offline changes with the server database."*

### B. Offline Behavior (No Internet / Network Failure)
1. When a network request fails (`Failed to fetch`, `net::ERR_INTERNET_DISCONNECTED`, or HTTP 504/502):
   - The user's input is never lost.
   - The payload is written into `IndexedDB` (`outbox_queue`) tagged with the module name (`school_profile`, `personnel`, `workload`, `sections`), school ID, and timestamp.
   - The UI shows an offline indicator: *"Working Offline — Changes saved to device."*

---

## 3. Unnecessary / Legacy Code Audit (To Be Pruned or Refactored)

The following patterns in the codebase actively conflict with this architecture and cause discrepancies (such as the 147 vs 157 personnel bug):

### 1. `chooseDraftSource` Silent Local Preference (`client/src/services/draftSync.js`)
- **Problem**: When both local IndexedDB draft and server cloud draft exist, it frequently chooses `"local"` based on client clock timestamps, ignoring fresh database records.
- **Fix**: When online, the server API must always take precedence. Local storage must only hold un-synced outbox delta mutations.

### 2. Immortal Tombstones & Deletion Sets (`AppContext.jsx` lines 4820–4860)
- **Problem**: `checkIfTombstoned` checks `deletedPersonnelIds` saved in drafts months or weeks ago. These persist in local drafts and suppress genuine master database personnel from displaying (e.g. dropping 157 rows down to 147).
- **Fix**: Deletions executed online are committed directly to `esf7_deleted_personnel` in PostgreSQL. Offline deletions are transient outbox actions that execute and clear upon reconnect, never acting as permanent filter masks.

### 3. Modal Prompts Interrupting Workflow (`checkAndPromptOutboxOnSectionOpen`)
- **Problem**: Prompts the user with SweetAlert2 ("Unsent Changes Available... Keep Database Version vs Load Unsent Changes") whenever entering a module where a prior network call failed.
- **Fix**: Replace manual modal prompting with the **Seamless Auto-Merge & Sync** pipeline.

---

## 4. Implementation Rules for Agents
1. **Never read `school_drafts` or IndexedDB as the primary master list when online.** Always query the normalized `esf7_*` tables.
2. **Outbox entries are single-use:** An outbox entry must be deleted immediately after receiving a `200 OK` from the server. Never leave stale outbox entries in browser storage.
3. **No blocking modals during page load:** Background sync runs cleanly with visual toast indicators, maintaining uninterrupted user experience.
4. **Personnel Profile Granular Tab Indexing**:
   - Each tab in Personnel Profile has a dedicated outbox module key and personnelId:
     - `identity` -> `personnel_identity` (`esf7_personnel_profile`)
     - `employment` -> `personnel_employment` (`esf7_personnel_employment`)
     - `education` -> `personnel_education` (`esf7_perssonel_educ`)
     - `development` (L&D) -> `personnel_ld` (`esf7_personnel_ld_trainings`)
     - `learning-area` -> `personnel_learning_area` (`esf7_personnel_learning_areas`)
   - Online saves write directly to the database via `savePersonnelChanges`.
   - Offline saves buffer to outbox using `tabModule` and `personnelId`.
   - Switching tabs or opening profiles triggers non-intrusive background auto-sync (`autoSyncOutboxOnSectionOpen`).
5. **Severance of Normalized Modules from `school_drafts`**:
   - School Profile, Personnel Roster, Personnel Profile, and Organized Classes persist directly to `esf7_school_profile`, `esf7_school_identity`, `esf7_personnel_profile`, `esf7_regular_sections`, and child relational tables.
   - **READ APIS**: All read APIs (`GET /api/schools/profile`, `GET /api/schools/identity`, `GET /api/personnel`, `GET /api/personnel/:id`, `GET /api/sections`, and `GET /api/school/draft`) assemble data directly from the normalized relational tables (`esf7_school_profile`, `schools`, `esf7_personnel_profile`, `esf7_personnel_employment`, `esf7_perssonel_educ`, `esf7_workload_rows`, `esf7_regular_sections`, `esf7_sned_sections`, `esf7_als_sections`, etc.). They NEVER query or read `school_drafts`.
   - **WRITE APIS**: They MUST NEVER trigger writes, flushes, or scrub operations against `school_drafts` (`confirmServerDraftSaved`, `saveDraft` in `completeNode` or `deletePersonnel`, and server-side draft updates are bypassed for these modules).

