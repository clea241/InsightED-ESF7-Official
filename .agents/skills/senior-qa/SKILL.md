---
name: senior-qa
description: Master Quality Assurance & Test Engineering skill for InsightED ESF7. Covers Local-First IndexedDB synchronization testing, Ephemeral QR submission queue burst testing, DepEd business rules & overload calculation verification, Timetable collision detection, and Pre-Rollout release gating.
---

# Senior QA Engineer (InsightED ESF7)

Master Quality Assurance, Test Automation, and Sync Resilience skill for the DepEd Electronic School Form 7 (eSF7) platform.

---

## 1. Core Testing Domains in InsightED ESF7

### A. Local-First & Synchronization Resilience
* **Dual-Store Model**: Validates client-side **IndexedDB (`esf7_drafts_db`)** and cloud **PostgreSQL (`esf7_school_drafts`)**.
* **Timestamp Arbitration**: Ensures that whenever both local and cloud drafts exist:
  - If $T_{\text{local}} \ge T_{\text{cloud}}$, the local draft wins and is persisted to cloud.
  - If $T_{\text{cloud}} > T_{\text{local}}$, the cloud draft updates local storage.
* **Offline Resilience**: Verifies 0ms input lag and zero data loss during network disconnection.

### B. Ephemeral QR Submission Queue Burst Ingestion
* **Endpoint**: `/api/personnel/submit-profile` & PostgreSQL table `esf7_personnel_submission`.
* **Burst Concurrency**: Simulates 30+ teachers submitting profiles simultaneously over 3-factor authentication (Passcode + Last Name + Birth Year).
* **Idempotency**: Prevents double-submissions or duplicate records when a user double-taps "Submit".

### C. Timetable Conflict & DepEd Policy Validation
* **Schedule Collision**: Detects overlapping class periods for the same teacher or room across day schedules (`M,T,W,TH,F`).
* **HGP & Advisory Rules**:
  - HGP (Homeroom Guidance Program) must total exactly 60 minutes per week.
  - Advisory time blocks may co-exist for the same section without collision.
* **Teaching Overload Threshold**:
  - 360 minutes daily standard teaching load cap.
  - Excludes non-teaching periods and term breaks.

---

## 2. Test Execution Commands

```bash
# Run Master Database Schema & Integrity Verifier (21 core tables)
npm run test:db

# Run Local-First Sync Resilience & Collision Verifier
npm run test:resilience
```

---

## 3. Pre-Rollout Quality Checklist (Go / No-Go Gate)
1. **Schema Check**: All PostgreSQL tables & foreign key cascades pass (`npm run test:db`).
2. **Resilience Check**: Timestamp arbitration, burst submissions, and schedule conflict verifiers pass (`npm run test:resilience`).
3. **No Uncaught Rejections**: All Express async routes wrapped in `try/catch` with structured JSON error responses.
4. **Offline Isolation**: IndexedDB `esf7_drafts_db` recovers cleanly even if server is offline.
