---
name: polling-and-read-cache-architect
description: Master agent skill for Polling Optimization, In-Memory / Redis Query Caching, Read Query Offloading, and Avalanche Prevention for high-concurrency eSF7 deployments.
---

# Polling & Read Cache Architect Knowledge Base

## 1. Problem Definition: The Polling Query Avalanche
When hundreds of school heads and teachers access the portal simultaneously:
- Continuous background polling (`GET /api/requests/incoming`, `GET /api/room-profiling/pending`, `GET /api/dashboard/stats`, `GET /api/room-profiling/approved`, `GET /api/room-profiling/check-lockout`) generates **hundreds of direct PostgreSQL queries per second**.
- Polling for unchanged data exhausts database connection pools, saturates disk I/O, causes Write-Ahead Log contention, and results in `Query read timeout` errors on legitimate write operations (like saving drafts and submitting personnel profiles).

---

## 2. Core Architectural Solutions

### A. High-Speed In-Memory / Redis Response Caching (Short TTL 3–5s)
- **Concept**: Repeated read queries for the same `school_id` are served directly from RAM (Node memory cache or local Redis).
- **TTL**: 3 to 5 seconds.
- **Cache Invalidation on Mutation**: When a write occurs (e.g., `POST /api/requests/send`, `POST /api/room-profiling/submit`, `POST /api/requests/respond`), the cache key for that school is purged immediately (`cache.del(key)`), ensuring zero stale reads.
- **Load Impact**: Eliminates 75%–85% of direct PostgreSQL read transactions.

### B. Frontend Active-View Aware Polling
- **View-Isolated Timers**: Only poll an endpoint if the user is actively viewing that specific page/modal:
  - Poll `/api/requests/incoming` only when on `RequestCenter` or notification badge is visible.
  - Poll `/api/room-profiling/pending` only when the School Head is on the `RoomQR` / Faculty Room live queue view.
- **Extended Intervals**: Increase background refresh intervals from 3s to 10s–15s.
- **Visibility API / Tab Inactivity Backoff**: Pause polling timers when the browser tab is hidden (`document.hidden === true`).

### C. Lightweight Header / Version Probing
- Instead of full JSON payloads on every poll, use a lightweight query (or `ETag` / `If-None-Match` / `Last-Modified`) to determine if data actually changed before executing a heavy table query.

### D. Composite B-Tree Indexing for High-Frequency Polling Filters
Ensure all filtered columns in high-frequency queries have dedicated indexes:
- `esf7_requests`: `idx_requests_school_status (requesting_school_id, status)` and `idx_requests_target_status (target_school_id, status)`
- `esf7_personnel_submission`: `idx_pers_sub_school_status (school_id, status)`
- `school_drafts`: `idx_school_drafts_school_year (school_id, school_year)`

---

## 3. Implementation Checklist for Agents
1. **Backend Cache Layer**: Wrap heavy read controllers (`requests`, `room_profiling`, `dashboard`) with in-memory TTL caching.
2. **Cache Eviction**: Add explicit cache busting on all relevant `POST`, `PUT`, `DELETE` routes.
3. **Frontend Lifecycle**: Audit `setInterval` hooks across `RequestCenter.jsx`, `RoomQR.jsx`, `Dashboard.jsx`, and `AppContext.jsx` to ensure clean unmounting and throttled execution.
