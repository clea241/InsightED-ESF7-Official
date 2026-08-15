# ESF7 Workload Technical Blueprint & Flow Specifications

This document serves as the authoritative blueprint for [Workload.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Workload.jsx).

---

## 1. Component Architecture & State Dependencies

### Context Dependencies (`useApp()`)
* **`personnel`** (`Array<Object>`): Global list of personnel. Each workload record is attached to personnel via `p.workloadRows`.
* **`classSections`** (`Array<Object>`): Global list of organized class sections.
* **`schoolInfo`** (`Object`): School details including `schoolName` and `schoolYear`.
* **`customSubjects`** (`Array<Object>`): Custom school subjects defined by the user.

### Workload Row Data Structure (`workloadRows`)
Each row object inside `workloadRows` contains:
* `id` (`String`): Unique identifier (e.g., `'r-a1b2c'`).
* `category` (`'Elementary'` | `'Junior High School'` | `'Senior High School'`).
* `subject` (`String`): Normalized subject name (e.g. `'Filipino'`, `'ADVISORY'`, `'HGP'`).
* `remediationSubject` (`String`): Remediation focus area if applicable.
* `gradeLevel` (`String`): Target grade (e.g. `'Grade 7'`).
* `sectionName` (`String`): Target class section name.
* `startTime` / `endTime` (`String`): Slot times formatted as `'HH:MM'` (24-hour format).
* `days` (`Array<String>`): Days of the week (`['M', 'T', 'W', 'TH', 'F']`).

---

## 2. Business Logic & Calculation Specifications

### A. Subject Normalization & Advisory/HGP Rules
* **Subject Normalizer (`normalizeSubjectName`)**:
  * Any string starting with or containing `'HOMEROOM GUIDANCE'`, `'HGP ('`, or equal to `'HGP'` is normalized strictly to `'HGP'`.
* **Advisory & HGP Workload Relationship**:
  * Subject Name: `'HGP'` (Homeroom Guidance Program).
  * HGP is an advisory-linked program component auto-assigned whenever a teacher is assigned as section adviser.
  * HGP date and time strictly fall within that section's designated `'ADVISORY'` time block (`ADVISORY Start <= HGP Start` and `HGP End <= ADVISORY End`).
  * `isAdvisoryOrHgpPair`: System treats `HGP` as a valid nested sub-interval within the `ADVISORY` block for the same section without flagging schedule conflict errors.

### B. Teaching Workload Slot Duration Limits
* **Elementary & Junior High School**:
  * Max period duration per subject slot is **1 hour (60 minutes)**.
* **Senior High School (Grade 11 & Grade 12)**:
  * Max period duration per subject slot is **6 hours (360 minutes)**.

### C. Offline Workload Delegation Package Generator (`generateWorkloadDelegationHTML`)
* **Purpose**: Generates a self-contained, offline HTML file allowing school heads and section coordinators to encode or view workload delegations offline.
* **Payload Structure (`INSIGHTED_WORKLOAD_DELEGATION_V1`)**:
  * Contains `schoolName`, `schoolYear`, `gradeSubjects`, `remediationFocusMap`, `sections`, and `teachers` with Base64 encoded payload (`jsonB64`).
  * Includes standalone CSS styling, interactive teacher sidebar, timetable viewer, and offline JSON exporter.

---

## 3. UI Section Map & Navigation Structure

```
+-----------------------------------------------------------------------------------+
| WORKLOAD HEADER & DELEGATION TOOLBAR                                              |
|  Title: Teacher Workload Timetable & Assignment                                  |
|  [Export Delegation Package] -> generateWorkloadDelegationHTML()                 |
+-----------------------------------------------------------------------------------+
| TEACHER SELECTION & OVERLOAD SUMMARY CARD                                         |
|  Selected Teacher: {firstName} {lastName} ({position})                           |
|  Total Weekly Teaching Load: {totalMinutes} mins ({totalHours} hrs)               |
|  Overload Status Badge: [Normal Load] vs [Overload Eligible ⚡]                   |
+-----------------------------------------------------------------------------------+
| WORKLOAD TIMETABLE GRID                                                           |
|  Category | Grade Level | Section | Subject | Time Slot (Start-End) | Days | Actions|
|  Row Items with real-time slot conflict indicator badges                          |
|  [+ Add Subject Slot] -> creates new workload row                                 |
+-----------------------------------------------------------------------------------+
| CONFLICT RESOLUTION OVERLAY (Conditional: conflicts.length > 0)                   |
|  Displays overlapping time slots (excluding valid HGP-within-ADVISORY blocks)     |
+-----------------------------------------------------------------------------------+
```

---

## 4. Versioned Flow History Log

* **Version 1.0 (2026-08-13)**: Initial master flow blueprint established.
  * Baseline features: Workload timetable matrix, HGP subject normalization, HGP nested ADVISORY conflict exclusion, slot duration limits (60m vs 360m), and offline delegation HTML package exporter (`INSIGHTED_WORKLOAD_DELEGATION_V1`).
