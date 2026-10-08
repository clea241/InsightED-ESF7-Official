---
name: room-qr-submission-architect
description: Master agent skill for Faculty Room QR Private 3-Factor Teacher Profiling (Passcode + Last Name + Birth Year), Ephemeral UNLOGGED Queue Ingestion (esf7_personnel_submission), Cross-Device Mobile-to-Laptop Sync, and Local-First IndexedDB Draft Integration.
---

# Room QR Submission Queue & Private Cross-Device Profiling Architect

## 🎯 Architecture Overview (46k School & 800k Teacher Scale)
To allow hundreds of thousands of teachers nationwide to self-profile on mobile devices with **zero roster leakage to outside scanners**, without crashing PostgreSQL, overwhelming the VM, or requiring School Heads to manually scan phone screens with webcams:

### 1. **Zero-Roster Leakage & 2-Step Sequential 3-Factor Gating**
- **Public URL Bypass**: URLs with `?view=room-profiling` bypass login screens and node-progression locks in `client/src/App.jsx`.
- **Zero-Dropdown Policy**: The mobile scan landing page (`client/src/pages/RoomProfiling.jsx`) **NEVER renders a public teacher dropdown list or pre-populated roster**. Outside scanners, students, and visitors see zero teacher names, IDs, or contact info.
- **2-Step Sequential Authentication Flow**:
  - **Step 1 (Passcode Verification)**:
    1. Teacher enters **ONLY** their active **8-Character Passcode** (e.g. `K8M2P9X4`).
    2. System verifies if the passcode is valid and belongs to an active personnel record in this school's roster (checking current & previous 1-hour TOTP window).
    3. If invalid, increments failed attempt counter.
    4. If valid, advances to **Step 2**.
  - **Step 2 (Identity Confirmation)**:
    1. Teacher confirms their **Last Name** (e.g. `DELA CRUZ`) and **Birth Year** (4-digit year, e.g. `1994`).
    2. System strictly matches against the candidate identified in Step 1 (exact surname and birth year match).
    3. If matched, clears failed attempts and unlocks **only their individual profiling form**.
    4. If mismatched, increments failed attempt counter with error details.
- **3-Attempt Limit & 10-Minute Lockout Penalty**:
  - If a user fails **3 consecutive attempts** (across Step 1 passcode or Step 2 identity verification), the verification screen is **disabled for 10 minutes** (`room_profiling_lockout_until` persisted in `localStorage` and synchronized across all devices via `esf7_passcode_lockout`).
  - An active countdown timer (`MM:SS`) is displayed to the user until the lockout period expires.

### 2. **Personnel Roster Birthdate Integration (`client/src/pages/Roster.jsx`)**
- When the School Head adds a new personnel via the **"Add Personnel" Modal**:
  - Full Name (First, Middle, Last, Name Extension)
  - Plantilla Position & DepEd Email Username
  - 🎂 **Birthdate** (`birthdate DATE`, e.g. `1994-08-25`) with standard DepEd teacher age validation.
- Capturing `birthdate` at personnel creation guarantees that `birthYear` is 100% available for Room QR 3-factor authentication.

### 3. **8-Character TOTP Passcode Engine (`client/src/utils/passcode.js`)**
- Upgraded from 6 to **8 uppercase alphanumeric characters** (e.g. `K8M2P9X4`).
- Deterministic hashing based on teacher identifier (`id` / `prn` / `lastName_firstName`) + 1-hour UNIX time window + secret salt.
- Rotates automatically on the 1-hour interval with full forward/backward grace period checking.

### 4. **School Head Master Passcode Gate (`client/src/pages/RoomQR.jsx`)**
- To prevent passersby or unauthorized office visitors from viewing teacher passcodes or approving pending drafts on the School Head's laptop:
  - Opening the **Room QR** tab displays a secure **School Head Master Passcode Modal**.
  - Entering the correct School Head PIN unlocks the session to view:
    - The **Live Teacher Passcodes Table** (with countdown timer, copy buttons, and reveal toggles).
    - The **Live Detected Submissions Queue**.

### 5. **Ephemeral Queue Table: `esf7_personnel_submission`**
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

### 6. **School Head Live Queue & 1-Click Draft Merge (`RoomQR.jsx`)**
- **Real-Time Polling**: School Head laptop polls `GET /api/room-profiling/pending?schoolId=...` every 3 seconds.
- **Live Detected Submissions Card**:
  - Displays teacher name, position, room tag, and submission time.
  - **"Review & Merge" Modal**: Renders side-by-side comparison (Current Roster Draft vs Teacher Submitted Verified Fields).
  - **"✓ Approve All" Button**: Instantly merges verified data across all submitted teachers into the local **IndexedDB Draft (`draft_${schoolId}_${schoolYear}`)** and calls `ack` to clear the queue.

---

## 🛠️ API Contract

| Endpoint | Method | Payload / Query | Description |
| :--- | :--- | :--- | :--- |
| `/api/room-profiling/submit` | `POST` | `{ schoolId, room, personnelId, personnelName, profileData }` | Enqueues teacher submission into `esf7_personnel_submission` |
| `/api/room-profiling/pending` | `GET` | `?schoolId=199998` | Fetches all pending submissions for that school |
| `/api/room-profiling/ack` | `POST` | `{ schoolId, submissionIds, personnelIds }` | Purges acknowledged submissions from the queue |
