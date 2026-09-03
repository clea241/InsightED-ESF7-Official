# ESF7 Workload Technical Blueprint & Flow Specifications

This document serves as the authoritative blueprint for [Workload.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Workload.jsx).

---

## 1. Component Architecture & State Dependencies

### Context Dependencies (`useApp()`)
* **`personnel`** (`Array<Object>`): Global list of personnel. Each workload record is attached to personnel via `p.workloadRows`.
* **`classSections`** (`Array<Object>`): Global list of organized class sections.
* **`schoolInfo`** (`Object`): School details including `schoolName` and `schoolYear`.
* **`customSubjects`** (`Array<Object>`): Custom school subjects defined by the user.
* **`workImmersionSchedulesMap`** (`Object`): Map of personnel ID to Work Immersion date supervision entries.
* **`fetchWorkImmersionSchedules(personnelId, schoolYear)`** (`Async Function`): Fetches Work Immersion schedule entries.
* **`saveWorkImmersionSchedules(personnelId, schedules, schoolYear, schoolId)`** (`Async Function`): Saves batch Work Immersion schedule entries.

### Workload Row Data Structure (`workloadRows`)
Each row object inside `workloadRows` contains:
* `id` (`String`): Unique identifier (e.g., `'r-a1b2c'`).
* `category` (`'Elementary'` | `'Junior High School'` | `'Senior High School'`).
* `subject` (`String`): Normalized subject name (e.g. `'Filipino'`, `'ADVISORY'`, `'HGP'`).
* `remediationSubject` (`String`): Remediation focus area if applicable.
* `gradeLevel` (`String`): Target grade (e.g. `'Grade 7'`).
* `sectionName` (`String`): Target class section name.
* `startTime` / `endTime` (`String`): Slot times formatted as `'HH:MM'` (24-hour format).
* `days` (`Array<String>`): Days of the week (`['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN']`). Supports weekend teaching assignments (`SAT`, `SUN`).

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

### C. Work Immersion Monthly Calendar & Overload Integration
* **Purpose**: Tracks daily Work Immersion supervision start/end times for Senior High School (SHS) teachers.
* **Overload Pay 1-to-1 Integration**:
  * Immersion supervision hours are summed monthly (`totalMonthHours = (totalMonthMins / 60).toFixed(1)`) and integrated 1-to-1 with regular teaching load for **Overload Pay Authorization**.
* **Month Schedule Pattern Duplication**:
  * `handleCopyMonthPattern`: Copies all date supervision slots for a selected source month (e.g., June).
  * `handlePasteMonthPattern`: Pastes and duplicates the schedule pattern to a target month (e.g., July or August).
* **Single Date Slot Drawer**:
  * Modal/drawer allowing set/edit/remove of exact `startTime` and `endTime` for any specific calendar date.

### D. Offline Workload Delegation Package Generator (`generateWorkloadDelegationHTML`)
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
|  Days Buttons: [M] [T] [W] [TH] [F] [SAT] [SUN] (Supports Weekend Teaching)       |
|  Live Badge: ⏱️ {diffM} mins/day · {weeklyM} mins/wk ({weeklyHours} hrs)           |
|  [+ Add Subject Slot] -> creates new workload row                                 |
+-----------------------------------------------------------------------------------+
| 🏢 WORK IMMERSION MONTHLY CALENDAR & OVERLOAD INTEGRATION PANEL                   |
|  Month/Year Selector | Total Monthly Hours | Overload Integration Badge           |
|  [📋 Copy {Month} Schedule] -> handleCopyMonthPattern()                           |
|  [📥 Paste to {Month}]    -> handlePasteMonthPattern()                           |
|  Interactive Calendar Grid (Click date -> opens Date Editor Drawer)                |
+-----------------------------------------------------------------------------------+
| CONFLICT RESOLUTION OVERLAY (Conditional: conflicts.length > 0)                   |
|  Displays overlapping time slots (excluding valid HGP-within-ADVISORY blocks)     |
+-----------------------------------------------------------------------------------+
```

---

## 4. Versioned Flow History Log

* **Version 1.6 (2026-09-04)**: Added Cross-Teacher "Copy Workload" Feature in Drag-and-Drop Weekly Schedule Editor.
  * Added toolbar "Copy Workload" button (`#btn-copy-workload`) adjacent to "Show Weekend (Sat/Sun)" button in the Drag-and-Drop Weekly Schedule Editor.
  * Implemented multi-step modal with source teacher search and filter roster mirroring the left-hand panel (search query, Grade Level filter, Category filter, live block count badges, and subject tags preview).
  * Added confirmation step supporting both "Merge with Existing Workload" (default) and "Replace Existing Workload" modes.
  * Integrated DepEd advisorship safeguard: strictly preserves official Section Advisory & HGP blocks for the target teacher while excluding non-applicable advisory assignments from the source teacher.
  * Embedded pre-flight schedule collision detection, MATATAG duration-policy validation (DepEd Order No. 12, s. 2024), and maximum duration checks, surfacing specific overlapping time slots, days, and policy warnings.
  * Commits copied rows through standard canonical `handleFieldChange('workloadRows', ...)` and `savePersonnelChanges(...)` pipelines for instant UI update and app-wide persistence.
* **Version 1.5 (2026-09-04)**: Added Live Duration Stickers/Badges to New Slot Preview Blocks.
  * Added live duration badges (`{diffM}m`) in the top-right corner of all active drag-to-create preview boxes across all spanned day columns, matching the visual style and placement of saved schedule blocks.
  * Added duration badges to staged multi-day secondary preview cards (`➕ Preview` with `{diffM}m` pill) in sync with the master card.
  * Computes duration live in real-time as user drags vertically to resize or horizontally across week days.
* **Version 1.4 (2026-09-03)**: Added MATATAG Policy Mandated Duration Auto-Enforcement & Block Inspector End-Time Lock.
  * Extracted canonical `getMatatagMandatedDuration(row, sectionsList)` deriving fixed daily duration rules per DepEd Order No. 12, s. 2024 (e.g. Grade 1 & Grade 2 MATATAG core subjects strictly requiring 40 mins/day).
  * Automatically disabled and locked the End Time picker in the Block Inspector with a visual `🔒 Fixed (40m by Policy)` badge when selecting a policy-mandated subject and grade combination.
  * Maintained fully editable Start Time while auto-calculating `endTime = formatMinutesToTime(startMins + mandatedDuration)` so the duration remains strictly read-only and policy-driven.
  * Prevented top/bottom edge resizing on Gantt blocks and pending slot creation cards when subject is policy-mandated, while preserving horizontal/vertical whole-block repositioning.
  * Replaced red violation callouts with a neutral sky-blue compliant badge (`ℹ️ MATATAG Policy: Duration is fixed at 40 mins/day for Grade 2 FILIPINO`) for compliant blocks, preserving red violation styling and providing an inline `⚡ Fix to 40m` one-click action only for legacy uncorrected slots.
* **Version 1.3 (2026-09-03)**: Added Multi-Day New Schedule Slot Creation & Grid Dragging.
  * Staged new slot creation into an interactive `pendingNewSlot` block upon clicking or dragging empty time slots.
  * Added horizontal drag-across-week interaction with dynamic day-column spanning and column boundary detection.
  * Added synchronized day-toggle chip controls (`[M] [T] [W] [TH] [F]`, `[SAT] [SUN]`) embedded directly on the pending slot block.
  * Rendered active preview blocks across all selected day columns at matching time positions with live conflict detection (`🔴 Overlap Conflict`).
  * Added top/bottom edge 5-minute resize snapping on pending slot and keyboard shortcuts (`Enter` to confirm, `Esc` to cancel).
  * On confirm, persists into canonical `currentPerson.workloadRows` via `handleFieldChange('workloadRows', rows)` with the selected days array.
* **Version 1.2 (2026-09-03)**: Added Drag-and-Drop Gantt Weekly Schedule View (`WorkloadGanttScheduleView`).
  * Replaced default row-based schedule time-entry UI with a drag-and-drop Gantt weekly grid view featuring days as columns and a 15-minute resolution time scale.
  * Added drag-to-move and top/bottom edge drag-to-resize subject blocks with 15-minute grid snapping.
  * Reimplemented MATATAG Order No. 12 s. 2024 per-grade duration warnings, HGP 60m weekly rules, duplicate subject rules, and schedule overlap conflicts as live visual indicators (red/amber block borders, conflict badges, policy callouts).
  * Maintained non-draggable/non-resizable locked treatment for `ADVISORY` blocks (07:30 to 08:30 M-F fixed).
  * Created Block Inspector panel for focused editing of Section, Subject, Remediation Focus, SHS Category, Days, and Start/End times.
  * Preserved `Sort Time`, `Cards`, `List`, `Clear This Teacher's Workload`, and `+ Add subject schedule` toolbar actions.
* **Version 1.1 (2026-08-26)**: Added Work Immersion Monthly Calendar & Overload Integration.
  * Added `workImmersionSchedulesMap`, `fetchWorkImmersionSchedules`, and `saveWorkImmersionSchedules` context integration.
  * Added Work Immersion interactive month calendar grid with date editor drawer (`editingStartTime`, `editingEndTime`).
  * Added Month Schedule Pattern Copy/Paste functionality (`handleCopyMonthPattern`, `handlePasteMonthPattern`).
  * Extended day selection options to include weekend teaching (`SAT`, `SUN`).
  * Added live daily/weekly minutes and hours badge rendering on workload rows.
* **Version 1.0 (2026-08-13)**: Initial master flow blueprint established.
  * Baseline features: Workload timetable matrix, HGP subject normalization, HGP nested ADVISORY conflict exclusion, slot duration limits (60m vs 360m), and offline delegation HTML package exporter (`INSIGHTED_WORKLOAD_DELEGATION_V1`).
