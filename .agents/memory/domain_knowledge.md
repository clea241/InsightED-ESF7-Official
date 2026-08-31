# ESF7 Domain Knowledge & Terminology

## Core Concepts
- **ESF7 (Electronic School Form 7)**: Department of Education (DepEd) School Personnel Assignment List and Basic Profile.
- **Personnel Qualifications**: Educational background, eligibility, specialization, and seminars/trainings attended by school staff.
- **Workload & Assignments**: Teaching load, advisory roles, non-teaching duties, and subject specializations.
- **Reports & Formats**: XLSB Excel exports, worker threads for report generation, official PDF/spreadsheet previews.

## System Architecture
- Client: React with Vite/Webpack, Topbar, Blueprint backgrounds, Custom CSS modules.
- Server: Node.js Express server running background jobs, worker threads for report processing, PostgreSQL / SQLite database controllers.



### Added 2026-07-23
- **Advisory & HGP Workload Relationship**:
  - Exact Subject Name: `HGP` (Homeroom Guidance Program).
  - HGP is an advisory-linked program component auto-assigned whenever a teacher is assigned as section adviser.
  - HGP date and time strictly fall within that section's designated `ADVISORY` time block (`ADVISORY Start <= HGP Start` and `HGP End <= ADVISORY End`).
  - System treats `HGP` as a valid nested sub-interval within the `ADVISORY` block for the same section without flagging schedule conflict errors.
  - **Workload Calculation Rule**:
    - **`ADVISORY` IS COUNTED** in the teacher's official workload and teaching minutes calculation.
    - **`HGP` IS STRICTLY EXCLUDED (0 minutes)** from workload, teaching minutes, and overload pay calculations. Stored in `esf7_workload_rows` with `subject: 'HGP'` for schedule display and conflict checks only.

### Added 2026-07-27
- **SY 2026-2027 3-Term School Calendar & Overload Pay Rules**:
  - **Term 1**:
    - Instructional Block: June 8 - September 1, 2026 (Report Months: June, July, August — 3 months)
    - End-of-Term Block: September 2-15, 2026 (No teaching load ➔ NO OVERLOAD PAY)
  - **Term 2**:
    - Instructional Block: September 16 - December 4, 2026 (Report Months: September, October, November — 3 months)
    - End-of-Term Block: December 7-18, 2026 (No teaching load ➔ NO OVERLOAD PAY)
  - **Term 3**:
    - Instructional Block: January 4 - March 23, 2027 (Report Months: January, February, March — 3 months)
    - End-of-Term Block: March 24 - April 8, 2027 (No teaching load ➔ NO OVERLOAD PAY)
  - **Vacation**: April 9 - June 6, 2027 (No teaching load ➔ NO OVERLOAD PAY)
  - Each Term generated report matrix contains **exactly 3 instructional months**. End-of-Term blocks and Vacation have no teaching load and are strictly excluded from overload pay computations.
- **Teaching Workload Slot Duration Limits**:
  - **Elementary & Junior High**: Max period duration is **1 hour (60 minutes)** per subject slot.
  - **Senior High School (Grade 11 & Grade 12 / SHS subjects)**: Max period duration is **6 hours (360 minutes)** per subject slot.

### Added 2026-08-17
- **Reassigned vs Borrowed & Clustered Inter-School Flow**:
  - **Clustered Status Symmetry**: If a teacher is **CLUSTERED**, both Mother Station and Destination Satellite Schools display the status as **`CLUSTERED`**.
  - **Reassigned vs Borrowed Status Asymmetry**:
    - **Mother Station (Origin)**: Displays status as **`REASSIGNED`**.
    - **Destination Station (Borrowed)**: Automatically displays status as **`BORROWED`** upon accepting the inter-school request.
  - **Shared Personnel Limitations**: In Borrowed/Clustered destination stations, master profiling fields (plantilla item, identity, GSIS/TIN, eligibility) are read-only (`isShared = true`).
  - **Dual-School Workload Assignment**: Both Mother School and Borrowed/Clustered Destination School can add and manage teaching workload rows for their own sections/subjects in `Workload.jsx`.

### Added 2026-08-26
- **MATATAG Curriculum Time Allotment & Workload Flagging (DepEd Order No. 012, s. 2024)**:
  - **Grade 1 (Monograde Sections)**:
    - **Mandatory Subjects (5)**: `LANGUAGE`, `READING AND LITERACY`, `MAKABANSA`, `MATHEMATICS`, `GMRC`.
    - **Required Time Allotment**: Exactly **40 minutes / day**, scheduled **5 days a week (Monday to Friday)** = **200 minutes / week** per subject.
    - **Disallowed Legacy Subjects**: `ENGLISH`, `FILIPINO`, `SCIENCE` are not part of Grade 1 MATATAG curriculum.
    - **HGP (Homeroom Guidance)**: Disregarded for workload minute calculations.
    - **Exclusion**: Multigrade sections (`MULTIGRADE`, `Grade 1 - Grade 2`) are excluded from strict monograde Grade 1 rules.
    - **Enforcement**:
      1. Real-time inline alert badges in `Workload.jsx` when slot is under/over-allotted or has missing days.
      2. Automated Section Audit in `AppContext.jsx` & `ValidationCenter.jsx` flagging missing subjects or under-allotted minutes.
  - **Grade 2 (Monograde Sections)**:
    - **Mandatory Subjects (5)**: `MAKABANSA`, `FILIPINO`, `ENGLISH`, `MATHEMATICS`, `GMRC`.
    - **Required Time Allotment**: Exactly **40 minutes / day**, scheduled **5 days a week (Monday to Friday)** = **200 minutes / week** per subject.
    - **Disallowed Subjects**: `LANGUAGE`, `READING AND LITERACY` (Grade 1 only), `SCIENCE` (Grade 3 onwards).
    - **HGP (Homeroom Guidance)**: Disregarded for workload minute calculations.
    - **Exclusion**: Multigrade sections (`MULTIGRADE`, `Grade 2 - Grade 3`) are excluded.
    - **Enforcement**: Strict RED error banners in Workload and Validation Center blocking invalid submissions.
  - **Grade 3 (Monograde Sections - Flexible Allotment Model)**:
    - **Mandatory Subjects (6)**: `MAKABANSA`, `FILIPINO`, `ENGLISH`, `MATHEMATICS`, `SCIENCE`, `GMRC`.
    - **Allowed Base Daily Durations**: Strictly **45, 50, 55, or 60 minutes / day**.
    - **Weekly Minimum Thresholds**:
      - `MAKABANSA` & `FILIPINO`: $\ge 200$ mins / week (45m $\times$ 5 days = 225m, or 50/55/60m $\times$ 4 days = 200/220/240m).
      - `ENGLISH`, `MATHEMATICS`, `SCIENCE`, `GMRC`: $\ge 225$ mins / week (45/50/55/60m $\times$ 5 days = 225/250/275/300m).
    - **Disallowed Subjects**: `LANGUAGE`, `READING AND LITERACY` (Grade 1 only), `EPP/TLE`, `MAPEH`, `ARALING PANLIPUNAN` (Grades 4-6 only).
    - **HGP (Homeroom Guidance)**: Disregarded for workload minute calculations.
    - **Exclusion**: Multigrade sections (`MULTIGRADE`, `Grade 3 - Grade 4`) are excluded.
    - **Enforcement**: Strict RED error banners in Workload and Validation Center blocking invalid submissions.
  - **Grades 4, 5, and 6 (Key Stage 2 Monograde Sections - Flexible Allotment Model)**:
    - **Mandatory Subjects (8)**: `EPP/TLE`, `MAPEH`, `ARALING PANLIPUNAN`, `FILIPINO`, `ENGLISH`, `MATHEMATICS`, `SCIENCE`, `GMRC`.
    - **Allowed Base Daily Durations**: Strictly **45, 50, 55, or 60 minutes / day**.
    - **Weekly Minimum Thresholds**:
      - `EPP/TLE`, `MAPEH`, `ARALING PANLIPUNAN`, `FILIPINO`: $\ge 200$ mins / week (45m $\times$ 5 days = 225m, or 50/55/60m $\times$ 4 days = 200/220/240m).
      - `ENGLISH`, `MATHEMATICS`, `SCIENCE`, `GMRC`: $\ge 225$ mins / week (45/50/55/60m $\times$ 5 days = 225/250/275/300m).
    - **Disallowed Subjects**: `MAKABANSA` (Grade 1-3 only), `LANGUAGE`, `READING AND LITERACY` (Grade 1 only).
    - **HGP (Homeroom Guidance)**: Disregarded for workload minute calculations.
    - **Exclusion**: Multigrade sections are excluded from strict monograde rules.
    - **Enforcement**: Strict RED error banners in Workload and Validation Center blocking invalid submissions.
  - **Grades 7, 8, 9, and 10 (Key Stage 3 - Junior High School Monograde Sections - Flexible Allotment Model)**:
    - **Mandatory Subjects (8)**: `TLE` (or `EPP/TLE`), `MAPEH`, `ARALING PANLIPUNAN`, `FILIPINO`, `ENGLISH`, `MATHEMATICS`, `SCIENCE`, `VALUES EDUCATION` (or `Values Ed` / `ESP` / `GMRC`).
    - **Allowed Base Daily Durations**: Strictly **45, 50, 55, or 60 minutes / day**.
    - **Weekly Minimum Thresholds**:
      - `TLE`, `MAPEH`, `ARALING PANLIPUNAN`, `FILIPINO`: $\ge 200$ mins / week (45m $\times$ 5 days = 225m, or 50/55/60m $\times$ 4 days = 200/220/240m).
      - `ENGLISH`, `MATHEMATICS`, `SCIENCE`, `VALUES EDUCATION`: $\ge 225$ mins / week (45/50/55/60m $\times$ 5 days = 225/250/275/300m).
    - **Disallowed Subjects**: `MAKABANSA` (Grade 1-3 only), `LANGUAGE`, `READING AND LITERACY` (Grade 1 only).
    - **HGP (Homeroom Guidance)**: Disregarded for workload minute calculations.
    - **Exclusion**: Multigrade sections are excluded from strict monograde rules.
    - **Enforcement**: Strict RED error banners in Workload and Validation Center blocking invalid submissions.
  - **Single Subject per Section Rule (Kinder to Grade 12)**:
    - **Principle**: Each core learning area/subject can only be assigned once per section (per semester in SHS).
    - **Proactive Dropdown Prevention**: In `Workload.jsx`, subjects already taken by another teacher (or in another row) are locked and labeled `[Subject] 🔒 (Assigned: [Teacher Name])`.
    - **Real-Time Error Flagging**: Rows containing duplicate subjects for the same section turn red with a strict error banner.
    - **Validation Center Audit**: Classified as a blocking `error` under `Schedule Conflicts & Duplicate Subjects`.
  - **Homeroom Guidance (HGP) Multi-Day & Fixed 60-Minute Weekly Allotment**:
    - **Principle**: HGP is fixed to **exactly 60 minutes per week** across the adviser's selected days from Monday to Friday (e.g. 1 day × 60m, 2 days × 30m, 3 days × 20m, 4 days × 15m, or 5 days × 12m).
    - **Database Mapping**: Saved to `esf7_workload_rows` with native `days` JSONB array (`["T", "TH"]`), `start_time`, `end_time`, and `raw_payload`.
    - **Real-Time UI & Validation**: Workload cards display a live computation badge (`⏱️ [daily]m/day × [days]d = [weekly] mins/wk`) and trigger a red error banner if weekly total $\neq 60$ minutes.
    - **Validation Center Audit**: Enforced as a blocking error in `AppContext.jsx` and `ValidationCenter.jsx`.

### Added 2026-08-27
- **46,000+ Nationwide School Scale & Local-First IndexedDB Architecture**:
  - **Zero Premature DB Writes**: While School Heads draft and edit in School Profile, Roster, Personnel Profile, Organized Classes (Regular, ARAL, Remediation/Enrichment), and Workload, all state lives 100% inside the browser on-device in **IndexedDB** (`draft_${schoolId}_${schoolYear}`) and localStorage.
  - **No Live DB Calls During Drafting**: No rows are written or deleted in `esf7_personnel_profile`, `esf7_regular_sections`, or related tables until the school head reaches the Validation Center and submits.
  - **Cloud Draft Backup (Option A)**: Lightweight debounced sync to `school_drafts` allows seamless multi-device switching without polluting operational relational tables.
- **Real-Time Cross-School Requests (`esf7_requests`)**:
  - **Only Live DB Feature**: Cross-school clustered and reassigned personnel requests use real-time database events so Mother and Satellite schools can interact asynchronously across devices.
  - **Data Ownership Separation**:
    - **Mother School (School A)**: Owns the full master personnel record (civil status, TIN/PhilSys, plantila item, step increment, degree, major/minor, post-grad, PRC license, L&D trainings, learning area matrix) + Mother School teaching workload.
    - **Satellite / Receiving School (School B)**: Only holds basic identity (Name, PRN, position, deployment: CLUSTERED/REASSIGNED/BORROWED) + Satellite School assigned teaching workload (`school_id = School B`).
    - **Queue Ingestion Rule**: When School B submits, the queue worker **never overwrites or wipes** Mother School's master profiling details.
- **Transactional VM Ingestion Worker (`esf7_submission_queue`)**:
  - **Atomic Transactions**: Every school ingestion executes inside a `BEGIN ... COMMIT / ROLLBACK` block. Any error rolls back all tables and records the reason in `esf7_submission_queue.error_message`.
  - **Parent-to-Child Sequential Ingestion**:
    1. `esf7_school_profile` (Parent)
    2. `esf7_personnel_profile` (Parent)
    3. Child tables: `esf7_personnel_employment`, `esf7_perssonel_educ`, `esf7_personnel_learning_areas`, `esf7_personnel_ld_trainings`, `esf7_personnel_designations`, `esf7_personnel_allowances`
    4. `esf7_regular_sections`, `esf7_aral_sections`, `esf7_remedial_enrichment_sections`
    5. `esf7_workload_rows`, `esf7_shs_workload_rows`, `esf7_workload_transfer`
  - **Input Sanitization & Upserts**: Worker sanitizes numbers (`parseInt(val) || 1`), dates, and uses `ON CONFLICT` upserts.