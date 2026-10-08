---
name: draft-sync-and-write-buffer-architect
description: Master agent skill for ESF7 Heavy Draft Persistence, Client-Side Debouncing, Local-First IndexedDB Buffering, Request Deduplication, and Asynchronous Write Throttling.
---

# Draft Sync & Write Buffer Architect Knowledge Base

## 1. Problem Definition: Heavy Draft Write Contention
When hundreds of School Heads actively configure eSF7 records:
- Every minor UI interaction (toggling allowances, editing designations, dragging workload cells) triggers a full `PUT /api/school/draft` containing 500KB to 2MB of serialized JSON.
- Rapid un-debounced client writes cause:
  1. High PostgreSQL Write-Ahead Log (WAL) disk saturation.
  2. Row-level write lock contention on the `school_drafts` table.
  3. Race condition overwrites where slower in-flight network requests overwrite newer user edits.
  4. Exhaustion of the PostgreSQL connection pool leading to `Query read timeout` errors.

---

## 2. Core Architectural Solutions

### A. Client-Side Local-First + Network Debounce (3–5s Buffer)
- **Instant Local Commit (0ms)**: Every user edit immediately updates memory state and persists to browser `IndexedDB` (`insighted_school_drafts`) and `localStorage`.
- **Debounced Cloud Sync**: Network dispatch to `PUT /api/school/draft` is delayed until the user is idle for **3 to 5 seconds**.
- **Impact**: Slashes network write frequency by ~90% (from 40+ writes/minute to 2–3 consolidated writes/minute per school).

### B. In-Flight Request Deduplication & Abort Controller
- If a new draft sync is scheduled while a previous HTTP request is still in transit:
  - Abort the previous in-flight request via `AbortController`.
  - Ensure only the latest snapshot is transmitted to the server.
- Prevents out-of-order race conditions and eliminates concurrent row lock contention on the database.

### C. Backend In-Memory Staging with Asynchronous Database Flush
- **Fast In-Memory Write (< 2ms)**: The API endpoint immediately updates the in-memory cache / Redis with the incoming draft payload and returns `200 OK` to the frontend.
- **Asynchronous Persistence**: PostgreSQL `school_drafts` table write is executed smoothly without blocking user response latency.

### D. Optimistic Revision Tracking
- Each draft payload maintains an incrementing `draft_version` integer.
- The server rejects stale drafts if `draft_version < current_db_version`, preventing regression when multiple browser sessions exist.

---

## 3. Implementation Checklist for Agents
1. **Frontend Hook**: Implement a dedicated `useDebouncedDraftSync` hook in `AppContext.jsx` or draft-saving components.
2. **Abort Management**: Integrate `AbortController` signal handling into `api.saveSchoolDraft`.
3. **Backend Controller**: Optimize `PUT /api/school/draft` in `server/controllers/schools/index.js` to write to in-memory cache first before disk transaction.
4. **IndexedDB Integrity**: Ensure IndexedDB transactions commit synchronously before scheduling cloud dispatch.
