---
name: room-qr-submission-architect
description: Master agent skill for Faculty Room QR Single-Scan Teacher Profiling, Ephemeral UNLOGGED Queue Ingestion (esf7_personnel_submission), Cross-Device Mobile-to-Laptop Sync, and Local-First IndexedDB Draft Integration.
---

# Room QR Submission Queue & Cross-Device Profiling Architect

## 🎯 Architecture Overview (46k School & 800k Teacher Scale)
To allow hundreds of thousands of teachers nationwide to self-profile on mobile devices without crashing PostgreSQL, overwhelming the VM, or requiring School Heads to manually scan phone screens with webcams:

### 1. **Frictionless Single-Scan Flow (No Login & No Second QR)**
- **Public URL Bypass**: URLs with `?view=room-profiling` bypass login screens and node-progression locks in `client/src/App.jsx`.
- **Teacher Mobile Experience**:
  - Teacher scans the printed Faculty Room QR poster once on the wall.
  - Form loads immediately on mobile browser (`client/src/pages/RoomProfiling.jsx`).
  - Teacher inputs 6-digit dynamic passcode/PRN, verifies profiling fields (TIN, PhilSys, degrees, eligibilities, PRC, civil status, trainings).
  - Tapping **"Submit Verification"** sends a single lightweight JSON payload to `/api/room-profiling/submit` and displays a clean confirmation screen. (Zero second QR codes to scan!).

### 2. **Ephemeral Queue Table: `esf7_personnel_submission`**
- **Schema Definition**:
  ```sql
  CREATE UNLOGGED TABLE IF NOT EXISTS esf7_personnel_submission (
    id VARCHAR(128) PRIMARY KEY,
    school_id VARCHAR(64) NOT NULL,
    personnel_id VARCHAR(64) NOT NULL,
    personnel_name VARCHAR(255),
    room_name VARCHAR(255),
    status VARCHAR(32) DEFAULT 'PENDING',
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_timestamp BIGINT
  );
  CREATE INDEX IF NOT EXISTS idx_pers_sub_school_status ON esf7_personnel_submission(school_id, status);
  ```
- **Why UNLOGGED?**
  - Bypasses PostgreSQL Write-Ahead Logging (WAL) for near-RAM throughput and 0 disk I/O strain.
  - Multi-Process / Cluster Safe: Bridges all PM2 worker instances seamlessly on the VM.
  - Zero Master DB Bloat: Does NOT write to `esf7_personnel_profile` or operational tables until the School Head certifies the form in Validation Center.
- **Auto-Purging Lifecycle**:
  - Automatically deletes items older than 24 hours via background interval.
  - When the School Head merges submissions, the rows are instantly deleted from `esf7_personnel_submission` via `/api/room-profiling/ack`.

### 3. **School Head Live Queue & 1-Click Draft Merge (`RoomQR.jsx`)**
- **Real-Time Polling**: School Head laptop polls `GET /api/room-profiling/pending?schoolId=...` every 3 seconds.
- **Live Detected Submissions Card**:
  - Displays teacher name, position, room tag, and time.
  - **"Review & Merge" Modal**: Renders side-by-side comparison (Current Roster Draft vs Teacher Submitted Verified Fields).
  - **"✓ Approve All" Button**: Instantly merges verified data across all submitted teachers into the local **IndexedDB Draft (`draft_${schoolId}_${schoolYear}`)** and calls `ack` to clear the queue.

---

## 🛠️ API Contract

| Endpoint | Method | Payload / Query | Description |
| :--- | :--- | :--- | :--- |
| `/api/room-profiling/submit` | `POST` | `{ schoolId, room, personnelId, personnelName, profileData }` | Enqueues teacher submission into `esf7_personnel_submission` |
| `/api/room-profiling/pending` | `GET` | `?schoolId=199998` | Fetches all pending submissions for that school |
| `/api/room-profiling/ack` | `POST` | `{ schoolId, submissionIds, personnelIds }` | Purges acknowledged submissions from the queue |
