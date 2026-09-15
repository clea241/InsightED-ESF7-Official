---
name: clustered-reassigned-architect
description: Master agent skill for DepEd eSF7 Inter-School Personnel Architecture, Reassigned Personnel zero-workload mother school isolation, Clustered Personnel dual-school workload coordination, Local-First IndexedDB Ghost Sync, and real-time co-editing timetable conflict resolution.
---

# Clustered & Reassigned Personnel Inter-School Architecture

This master skill defines the definitive DepEd eSF7 rules, database models, real-time sync protocols, and Local-First UI behaviors for personnel shared across schools.

---

## 1. Core Definitions & School Role Matrix

### Role Definitions:
- **Mother School** (`requester_school_id` / Original Plantilla School):
  - The school holding the official Plantilla item and permanent government appointment for the teacher.
- **Host / Receiving School** (`target_school_id`):
  - The partner school borrowing or receiving the teacher for shared/reassigned teaching duties.

### Comparison Matrix:

| Attribute | Mother School (School A) | Reassigned to School B | Clustered with School B |
| :--- | :--- | :--- | :--- |
| **Profile Data** | Full Master Record (TIN, PhilSys, Degrees, PRC) | Minimal Stub (`isShared: true`, Name, PRN, Position) | Minimal Stub (`isShared: true`, Name, PRN, Position) |
| **Workload in School A** | Standard Timetable | **Strictly 0 (No Workload / 0 mins)** | **Active Teaching Load** |
| **Workload in School B** | N/A | **Full Teaching Load (100% of load)** | **Active Teaching Load** |
| **Overlap Conflict Check** | Standard Local Check | ❌ Not Needed (Mother School has 0 slots) | **⚠️ Real-Time Cross-School Sync Required** |
| **Submission Model** | Certified with 0 load | Certified with full load | Both schools certify their respective partitions |

---

## 2. Reassigned Personnel Rules (`request_type === 'reassigned_teacher'`)

1. **Mother School Workload Isolation**:
   - The Mother School reports the teacher as officially deployed/reassigned out.
   - `workloadRows: []`, `teachingMinutes: 0`, `overloadHours: 0`.
   - The Mother School's timetable validator must never require teaching load for reassigned-out faculty.
2. **Host School Workload Ownership**:
   - Host School B has 100% ownership of the teacher's schedule.
   - All classes, sections, and subjects are encoded in School B.
3. **No Cross-School Conflict Checks Needed**:
   - Because School A has 0 slots, schedule collision across schools is mathematically impossible for reassigned personnel.

---

## 3. Clustered Personnel Rules (`request_type === 'clustered_teacher'`)

1. **Dual-School Workload Model**:
   - Clustered personnel is the **ONLY** personnel category where both School A and School B assign active teaching load.
2. **Standard Load Coordination**:
   - DepEd standard teaching load is **6.0 hours / 360 minutes daily**.
   - The teacher's total teaching load is the sum of both schools:
     $$\text{Total Load} = \text{Load}_{\text{School A}} + \text{Load}_{\text{School B}}$$
   - Both schools see a live combined load counter: e.g., *"180 mins (School A) + 180 mins (School B) = 360 mins Total"*.

---

## 4. Local-First Real-Time Ghost Sync Architecture

To allow instant, zero-latency local editing while preventing schedule collisions between School A and School B:

```
       [ SCHOOL A (Mother School) ]                     [ SCHOOL B (Host School) ]
      ┌────────────────────────────┐                  ┌────────────────────────────┐
      │  IndexedDB (Local-First)   │                  │  IndexedDB (Local-First)   │
      │  ├─ 40 Regular Teachers    │                  │  ├─ 35 Regular Teachers    │
      │  └─ Clustered Teacher X    │                  │  └─ Clustered Teacher X    │
      │     ├─ myWorkloadRows [✔]  │                  │     ├─ myWorkloadRows [✔]  │
      │     └─ sharedWorkloadRows [🔒]                │     └─ sharedWorkloadRows [🔒]
      └─────────────┬──────────────┘                  └─────────────▲──────────────┘
                    │                                               │
                    │ 1. Local Write + WebSocket Event              │ 3. Receive & Update LocalDB
                    ▼                                               │
           ┌─────────────────────────────────────────────────────────────┐
           │                   InsightED Real-Time Relay                 │
           │           (In-Memory Room keyed by Teacher PRN)             │
           └─────────────────────────────────────────────────────────────┘
```

### A. IndexedDB Dual-Partition Storage
For clustered teachers, the local IndexedDB draft stores two distinct workload lists:
```javascript
{
  id: "PER-100115-003",
  prn: "10029384",
  isShared: true,
  myWorkloadRows: [
    { day: "Monday", startTime: "08:00", endTime: "09:00", subject: "Math 7", sectionName: "Sampaguita" }
  ],
  sharedWorkloadRows: [
    { day: "Tuesday", startTime: "09:00", endTime: "10:00", subject: "Science 7", schoolId: "100120", schoolName: "Mabini High" }
  ]
}
```

### B. Real-Time WebSocket Event Flow
1. **Activation**: Triggered when `esf7_requests` status is set to `'approved'` for `clustered_teacher`.
2. **Channel Subscription**: Both schools subscribe to `room:clustered_${prn}`.
3. **Broadcasting Updates**:
   - When School A drags/drops or edits a slot:
     1. Local IndexedDB is written immediately (0ms lag).
     2. A lightweight event (~200 bytes) is broadcasted:
        ```json
        {
          "event": "CLUSTERED_SLOT_UPDATE",
          "prn": "10029384",
          "authorSchoolId": "100115",
          "authorSchoolName": "Rizal High",
          "slots": [
            { "day": "Monday", "startTime": "08:00", "endTime": "09:00", "subject": "Math 7" }
          ]
        }
        ```
     3. School B receives the packet and updates its `sharedWorkloadRows` in IndexedDB.
     4. School B's timetable grid immediately locks the block as a **Ghost Slot**.

### C. Ghost Slot Visual Specification
- **Coloring**: Subtle striped amber/gray pattern (`background: repeating-linear-gradient(45deg, #FEF3C7, #FEF3C7 10px, #FFFBEB 10px, #FFFBEB 20px)`).
- **Badge**: 🔒 *"Occupied by [School Name] • [Subject] ([Start]–[End])"*.
- **Interaction**: Read-only, unmovable, non-deletable by the borrowing school.

### D. Reconnection & Offline Handshake
If School B was offline while School A was editing:
1. Upon opening the Workload view or reconnecting, the client calls `GET /api/clustered-sync/:prn`.
2. The server responds with the latest active `sharedWorkloadRows` for that PRN.
3. The client updates IndexedDB automatically.

---

## 5. Validation Center Certification Rules

During certification & submission in `ValidationCenter.jsx`:
1. **Clustered Overlap Check**:
   - Check `myWorkloadRows` against `sharedWorkloadRows`.
   - If any `(day, startTime, endTime)` collides, block certification with an explicit error:
     > ❌ *"Schedule Conflict: Clustered Teacher [Name] has overlapping hours with [Other School Name] on [Day] [Start–End]."*
2. **Reassigned Personnel Check**:
   - Mother School MUST have 0 workload rows.
   - Host School MUST have >= 1 workload row.

---

## 6. Implementation Checklist for Agents
- [ ] Ensure `useApp()` parses `myWorkloadRows` and `sharedWorkloadRows` for clustered personnel.
- [ ] Connect WebSocket listener on `Workload.jsx` mount when viewing a clustered teacher.
- [ ] Render Ghost Slots in Timetable Gantt & Grid with school attribution.
- [ ] Provide live combined teaching load calculation (`School A mins + School B mins`).
- [ ] Enforce zero-workload validation bypass for Reassigned-out personnel in Mother School.

---

## 7. Multi-Agent Sandbox QA & Supervisor Loop

The repository contains an automated closed-loop sandbox supervisor and QA test harness:
- **Supervisor Runner**: `node esf7_agents/clustered-reassigned-architect/scripts/supervisor_sandbox.js`
- **Builder Engine**: `esf7_agents/clustered-reassigned-architect/scripts/builder_clustered_engine.js`
- **QA Auditor**: `esf7_agents/clustered-reassigned-architect/scripts/qa_audit_clustered.js`

### Loop Execution Protocol:
1. **Supervisor** initializes the sandbox and launches the **Builder Agent**.
2. **QA Auditor Agent** runs 10 exhaustive assertion suites testing all DepEd edge cases (Mother School 0 workload, Clustered cross-school collisions, HGP exclusions, 360m standard load math, and ghost sync packet serialization).
3. If any defect is detected, telemetry is handed back to the Builder Agent to apply targeted hotfixes, and the QA loop is re-executed.
4. The loop terminates only when **100% of all tests pass with 0 defects**.

