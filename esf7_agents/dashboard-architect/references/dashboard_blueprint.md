# ESF7 Dashboard Technical Blueprint & Flow Specifications

This document serves as the authoritative blueprint for [Dashboard.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Dashboard.jsx). It documents all state dependencies, business math rules, data ingestion pipelines, UI components, and navigation routes.

---

## 1. Component Architecture & State Dependencies

### Context Dependencies (`useApp()`)
* **`personnel`** (`Array<Object>`): Global list of registered school personnel. Each record contains attributes:
  * `sexAtBirth` / `gender`
  * `birthdate` / `dateOfBirth` / `dob` / `birthDate`
  * `natureOfAppointment` / `appointmentStatus` / `employmentStatus`
  * `assignedGradeLevels` (`Array<String>`)
  * `degreeMajor` / `major` / `specialization`
  * `workloadRows` (`Array<Object>`) with `gradeLevel`, `subject` / `subjectName`
* **`classSections`** (`Array<Object>`): List of organized class sections. Each section has `gradeLevel`.
* **`schoolInfo`** (`Object`): School details including `schoolId` and `schoolName`.
* **`setActiveView`** (`Function`): Function to switch the active view layout (`'roster'`, `'organized_classes'`, `'validation'`, `'reports'`).
* **`showToast`** (`Function`): Helper to trigger toast notifications.

### Local Component State
* **`stats`** (`Object`): Data returned from `api.getDashboardStats()`. Contains `school_overview` and `term_calendar_status`.
* **`loading`** (`Boolean`): Loading state indicator for stats fetching.
* **`isUploadModalOpen`** (`Boolean`): Controls visibility of the `<ESF7UploadModal />`.

---

## 2. API & Data Ingestion Pipelines

### `api.getDashboardStats()`
* **Trigger**: Executed on mount and whenever `schoolInfo?.schoolId` changes.
* **Cleanup Contract**: Uses `isCancelled` flag inside `useEffect` cleanup return to prevent setting state on unmounted components.
* **Fallback Defaults**:
  * **School Name**: `stats?.school_overview?.school_name` ➔ `schoolInfo?.schoolName` ➔ `'DepEd Integrated School'`.
  * **Term Status (`termStatus`)**:
    * `current_school_year`: Default `'SY 2026-2027'`
    * `active_term`: Default `'Term 1'`
    * `block_type`: `'INSTRUCTIONAL'` vs `'END_OF_TERM'`
    * `overload_pay_eligible`: `Boolean`
    * `active_date_range`: Default `'June 8, 2026 - September 1, 2026'`

---

## 3. Business Logic & Calculation Specifications

### A. Demographic Age Bracket Calculation
* **Source**: `personnel` list.
* **Categories**: `'20-25'`, `'26-30'`, `'31-40'`, `'41-50'`, `'51-60'`, `'60+'`, `'Unspecified'`.
* **Rules**:
  * Evaluates birthdate string using `new Date(dob)`.
  * If invalid date or null ➔ assigned to `'Unspecified'`.
  * Calculates exact age taking into account birth month and birth day relative to current date.

### B. Plantilla / Appointment Status Breakdown
* **Source**: `personnel` list.
* **Categories**: `'PERMANENT'`, `'PROVISIONAL'`, `'SUBSTITUTE'`, `'CONTRACT OF SERVICE'`, `'OTHERS'`.
* **Rules**: Normalizes appointment string with `.toUpperCase().trim()`:
  * Includes `'PERMANENT'` or `'REGULAR'` ➔ `PERMANENT`
  * Includes `'PROVISIONAL'` ➔ `PROVISIONAL`
  * Includes `'SUBSTITUTE'` ➔ `SUBSTITUTE`
  * Includes `'CONTRACT'`, `'COS'`, or `'JOB ORDER'` ➔ `CONTRACT OF SERVICE`
  * Default ➔ `OTHERS`

### C. Teacher Excess & Shortage Analysis by Grade Level
* **Target Grades**: `'Grade 1'` through `'Grade 12'`.
* **Logic**:
  1. Counts `sectionCount` for each grade from `classSections`.
  2. Counts `teacherCount` assigned to that grade by checking if grade is in `p.assignedGradeLevels` or in any row of `p.workloadRows`.
  3. Computes `diff = teacherCount - sectionCount`.
  4. Classifies status:
     * `sectionCount === 0` ➔ `statusBadgeClass: 'none'`, Text: `'No Classes'`
     * `diff === 0` ➔ `statusBadgeClass: 'balanced'`, Text: `'Ideal Ratio'`
     * `diff < 0` ➔ `statusBadgeClass: 'shortage'`, Text: `'Shortage (N Needed)'`
     * `diff > 0` ➔ `statusBadgeClass: 'surplus'`, Text: `'Surplus (+N Extra)'`

### D. Major Alignment & Out-of-Field Teaching KPI
* **Logic**:
  1. Evaluates teachers with specified `degreeMajor`/`major`/`specialization` (excluding `'NONE'`, `'N/A'`, `'GENERALIST'`).
  2. Compares degree major against teaching subject strings in `p.workloadRows`.
  3. If subject string contains major or vice versa ➔ `inFieldCount++`, else `outOfFieldCount++`.
  4. Computes percentage: `Math.round((inFieldCount / totalEvaluated) * 100)%`.

### E. SY 2026-2027 3-Term DepEd School Calendar Rules
* **Instructional Blocks**:
  * **Term 1**: June 8 - Sept 1, 2026 (June, July, August — 3 months) ➔ Overload Pay Eligible ⚡
  * **Term 2**: Sept 16 - Dec 4, 2026 (Sept, Oct, Nov — 3 months) ➔ Overload Pay Eligible ⚡
  * **Term 3**: Jan 4 - Mar 23, 2027 (Jan, Feb, Mar — 3 months) ➔ Overload Pay Eligible ⚡
* **End-of-Term Blocks & Vacation**:
  * Term 1 End: Sept 2-15, 2026 (No teaching load ➔ NO OVERLOAD PAY ⛔)
  * Term 2 End: Dec 7-18, 2026 (No teaching load ➔ NO OVERLOAD PAY ⛔)
  * Term 3 End: Mar 24 - Apr 8, 2027 (No teaching load ➔ NO OVERLOAD PAY ⛔)
  * Vacation: Apr 9 - June 6, 2027 (No teaching load ➔ NO OVERLOAD PAY ⛔)

---

## 4. UI Layout & Navigation Map

```
+-----------------------------------------------------------------------------------+
| HERO HEADER BANNER                                                               |
|  [SY 2026-2027] [Term 1 — Instructional Block] [⚡ Overload Pay Eligible]        |
|  School Name: {schoolName} | Active Date Range: {active_date_range}              |
|  [+ Add Personnel] -> setActiveView('roster')                                     |
|  [Organized Classes] -> setActiveView('organized_classes')                        |
|  [Run Validation] -> setActiveView('validation')                                  |
|  [Generate Form 7] -> Header action button                                       |
+-----------------------------------------------------------------------------------+
| ROW 1 SUMMARY CARDS (3-column grid)                                              |
|  Card 1: Personnel Roster Stats (Total, Male, Female count)                       |
|  Card 2: Organized Classes Summary (Total sections, breakdown by grade)           |
|  Card 3: Major Alignment & Out-of-Field Teaching Quality KPI (% matched)          |
+-----------------------------------------------------------------------------------+
| ROW 2 DEMOGRAPHIC & HR CARDS (2-column grid)                                      |
|  Card 1: Age Bracket Summary Progress Bars (20-25 to 60+)                         |
|  Card 2: Employment Appointment Status Breakdown (Permanent, COS, etc.)           |
+-----------------------------------------------------------------------------------+
| ROW 3 STAFF BALANCE ANALYSIS GRID                                                 |
|  Teacher Excess & Shortage Summary Cards per Grade Level (Balanced/Shortage/Surplus) |
+-----------------------------------------------------------------------------------+
| MODALS                                                                            |
|  <ESF7UploadModal isOpen={isUploadModalOpen} onClose={...} />                     |
+-----------------------------------------------------------------------------------+
```

---

## 5. Versioned Flow History Log

Whenever new cards, features, or action handlers are added to `Dashboard.jsx`, append them below with timestamp and description so legacy flows are preserved and traceable.

* **Version 1.0 (2026-08-12)**: Initial master flow blueprint established.
  * Baseline data cards: Hero Banner, Roster Summary, Organized Classes, Major Alignment KPI, Age Brackets, Appointment Breakdown, Teacher Excess & Shortage by Grade Level, `ESF7UploadModal` integration.
* **Version 1.1 (2026-08-18)**: Added Subject-Specialization Alignment Summary Chart.
  * Features 100% stacked horizontal bar chart for exact DepEd subject list (`ENGLISH`, `MATHEMATICS`, `SCIENCE`, `EPP/TLE`, `ARALING PANLIPUNAN`, `FILIPINO`, `MAPEH`, `GMRC/ESP/VALUES EDUCATION`).
  * Supports level toggling (`Elementary`, `Junior High School`, `Senior High School`) and computes alignment based on weekly workload teaching minutes.
* **Version 1.2 (2026-08-18)**: Added Learning Area & L&D Competency Heatmap Grid.
  * Features 5-column breakdown (`SUBJECT`, `DIRECT DEGREE MATCH`, `LEARNING AREA MATCHED`, `L&D / TRAINING MATCHED (≥8 HRS)`, `UNQUALIFIED OUT-OF-FIELD`).
  * Evaluates teacher qualifications across degree majors, learning area experience history, and L&D seminars with $\ge 8$ total hours.
