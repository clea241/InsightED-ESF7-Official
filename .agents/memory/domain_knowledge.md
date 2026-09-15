# ESF7 Domain Knowledge & Terminology

## Core Concepts
- **ESF7 (Electronic School Form 7)**: Department of Education (DepEd) School Personnel Assignment List and Basic Profile.
- **Personnel Qualifications**: Educational background, eligibility, specialization, and seminars/trainings attended by school staff.
- **Workload & Assignments**: Teaching load, advisory roles, non-teaching duties, and subject specializations.
- **Reports & Formats**: XLSB Excel exports, worker threads for report generation, official PDF/spreadsheet previews.

## System Architecture
- Client: React with Vite/Webpack, Topbar, Blueprint backgrounds, Custom CSS modules.
- Server: Node.js Express server running background jobs, worker threads for report processing, PostgreSQL / SQLite database controllers.

### Added 2026-09-15 (Reassigned vs Clustered Personnel Inter-School Architecture)
- **Reassigned Personnel vs Clustered Personnel Rules**:
  - **1. Reassigned Personnel (`request_type === 'reassigned_teacher'`)**:
    - **Mother School** (`requester_school_id` / Original Plantilla School):
      - Holds the **FULL profile / appointment / personal information** of the personnel.
      - Has **ZERO WORKLOAD (`workloadRows: []`, 0 teaching minutes)** in Mother School.
    - **Receiving / Host School B** (`target_school_id`):
      - Holds the **FULL WORKLOAD** (all class programs, timetable slots, sections).
      - Has minimal profile info (`isShared: true`, Name, PRN, Position).
    - **Overlap Rule**: Reassigned personnel **NEVER** have schedule conflicts across schools because Mother School assigns 0 workload rows.
  - **2. Clustered Personnel (`request_type === 'clustered_teacher'`)**:
    - The **ONLY** personnel category that has **ACTIVE WORKLOAD in BOTH School A (Mother School) and School B (Host School)**.
    - Both School A and School B assign timetable slots to the teacher.
    - **Overlap Rule**: Schedule overlap conflict detection applies **EXCLUSIVELY to Clustered Personnel**.
    - When School B schedules a clustered teacher, School A's slots must not overlap with School B's slots on the same day and time.
- **Multi-Grade (MG) Elementary Isolation**:
  - In DepEd, Multi-Grade classes are strictly an Elementary curriculum feature (`Grade 1` to `Grade 6`).
  - Pure Secondary schools (Junior High School and Senior High School) without Elementary offerings (`!hasElementary`) have the **`Multi Grade` (`MULTIGRADE`)** option completely removed from the Class Type dropdown in both inline section creation and inline section editing.
  - If a school lacks Elementary offerings, any attempt to save or edit a regular section as `MULTIGRADE` automatically defaults/reverts to `MONO GRADE`.

### Added 2026-09-07 (Workload & Gantt Persistence Architecture)
- **Workload Batch Persistence Pipeline**:
  - `PUT /api/workloads/personnel/:personnelId` is the canonical endpoint for saving all workload rows (`workloadRows`), teaching-related tasks (`teachingRelatedRows`), administrative tasks (`administrativeRows`), and SHS workloads (`shsWorkloads`).
  - **Transaction Guarantee**: Wrapped in PostgreSQL `BEGIN ... COMMIT/ROLLBACK`.
  - **Dual Persistence Strategy**:
    1. Synchronizes `esf7_personnel_profile.raw_payload` with latest `{ workloadRows, teachingRelatedRows, administrativeRows }`.
    2. Atomic replacement (`DELETE FROM esf7_workload_rows WHERE personnel_id = $1`) followed by bulk re-insertion into `esf7_workload_rows` with all columns (`grade_level`, `section_id`, `section_name`, `subject`, `start_time`, `end_time`, `days`, `term`, `raw_payload`).
    3. If SHS workloads are present, updates `esf7_shs_workload_rows`.
  - **Loading & Querying**: `GET /api/personnel` and `GET /api/personnel/:id` query `esf7_workload_rows` directly to populate `workloadRows`, ensuring that page reloads or cross-device access never lose saved timetable data.
  - **UI Triggers**:
    - **Gantt Header**: Quick `<button onClick={handleSaveChangesDirectly}><FiSave /> Save Workload</button>`.
    - **Workload Toolbar**: Dedicated `<button onClick={handleSaveChangesDirectly}><FiSave /> Save Workload</button>` alongside `+ Add subject schedule`.
    - **Bottom Action Bar**: Prominent `Save Changes` and `Save & Validate Workload` buttons.
    - **Navigation Safeguard**: `PortalHeader.onContinue` auto-saves workload before moving to Deployment (`room-qr`).
  - **Administrative Tasks Dropdown Options**:
    - Removed generic `"ADMINISTRATIVE"` and `"RELATED TASK"` options from `ADMINISTRATIVE_TASK_OPTIONS` and mono grade subject arrays.
    - Official selectable options strictly consist of:
      1. `ADMIN TASK - PERSONNEL ADMINISTRATION`
      2. `ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP`
      3. `ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT`
      4. `ADMIN TASK - FINANCIAL MANAGEMENT`
      5. `ADMIN TASK - RECORDS MANAGEMENT`
      6. `ADMIN TASK - PROGRAM MANAGEMENT`



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

### Added 2026-09-03
- **Historical eSF7 Master Database & SY 2025-2026 Mandate**:
  - The national table `esf7_database` stores historical faculty records for **School Year 2025-2026**.
  - When a School Head logs in and has **0 records** in `esf7_database` and `esf7_database_dummy`:
    - The Executive Dashboard automatically prompts: *"You need to submit your eSF7 file for SY 2025-2026. Please upload your official .xlsb (or .xlsx) spreadsheet to auto-populate your faculty roster."*
    - The upload modal is presented automatically on initial landing with a persistent notification banner on the dashboard if dismissed.
  - **Test Sandbox Isolation**:
    - School IDs between **`800000` and `800100`** (and `199900`–`199999`) are designated test/sandbox accounts.
    - When their spreadsheets are ingested by the VM harvester daemon (`esf7_harvester.js`), they are routed exclusively to **`esf7_database_dummy`**, keeping production `esf7_database` (SY 2025-2026) 100% clean and audit-proof.
  - **Forced Logout & Confirmation Modal**:
    - If an established school attempts to dismiss the SY 2025–2026 upload modal, `ForceLogoutNoticeModal.jsx` is displayed:
      *"Notice: Established DepEd schools must submit their official SY 2025–2026 eSF7 file to initialize their station. Do you want to cancel and log out?"*
    - Actions: `[ Stay & Upload File ]` (keeps user on upload modal) or `[ Cancel & Log Out ]` (logs out via `useAuth.logout()`).
  - **Enhanced Authentication & School ID Error Prompts**:
    - Raw database errors mentioning internal tables (e.g. `user_schoolhead`) are strictly prohibited in user-facing error prompts.
    - Whenever a School ID is not found in `user_schoolhead`, the system must return:
      *"School ID [ID] is not yet registered in the DepEd InsightED portal. Please verify your 6-digit School ID, register first, or contact your Division Office to register your station."*
  - **Personnel Roster - Add Personnel Modal**:
    - The redundant `DESIGNATION` (MR./MRS./MS. salutation) dropdown has been removed from the Add Personnel modal in `Roster.jsx`. Personnel entry begins directly with First Name, Middle Name, Last Name, and Position.
    - DepEd email field spans 2 columns with `validateDepEdEmail` restriction matching `PersonnelProfile.jsx`: prevents typing `@`, validates that the email contains the personnel's first and last name, shows inline error messages, and disables submission until valid.
  - **Organized Classes Workspace Architecture (Option 1 Focused Tabs)**:
    - Replaced side-by-side 50/50 split with a top segmented workspace switcher:
      `[ 🏫 Class Sections & Advisers ]` vs `[ 📚 Curriculum & Subjects Taught ]`.
    - Consolidated the previous 7 scattered KPI boxes into a single horizontal executive summary ribbon with total enrollment (Male / Female pills), total sections, and class size health distribution (Within / Below / Above Standard).
    - Added Grade Level Filter pills (`All`, `Kinder`, `Grade 1`...) for quick jumping across grade levels.
    - Subjects Taught now renders as a full-width responsive grid (`repeat(auto-fill, minmax(320px, 1fr))`) instead of a narrow vertical scroll.

### Added 2026-09-07
- **DepEd Email Validation Policy & Married Personnel Maiden Surnames**:
  - **Function Signature**: `validateDepEdEmail(email, firstName, lastName, middleName)` in `client/src/context/AppContext.jsx`.
  - **Married Personnel Maiden Surnames**:
    - Under Philippine legal and civil registration conventions, when a female educator marries, her maiden surname becomes her Middle Name on official government records (eSF7/plantilla), and she adopts her husband's surname as her Last Name.
    - However, her official DepEd Google Workspace email account (`@deped.gov.ph`) is often retained from prior to marriage (e.g. `maria.santos@deped.gov.ph` for `Maria Santos Reyes`) or issued as a compound name (`maria.santos.reyes@deped.gov.ph` / `maria.s.reyes@deped.gov.ph`).
    - **Validation Rule**: The surname validation check accepts **EITHER** the legal `lastName` OR the `middleName` (maiden surname). Both are fully recognized as valid identity proofs.
  - **Disambiguation Support**: ICT disambiguation numbers (e.g. `001`, `002`) and middle initials are permitted without triggering name mismatch errors.
  - **First Name Tokenization**: Multi-word first names (e.g., `Mary Jane`, `Ma. Theresa`) match if any individual token appears in the local part of the email address.
  - **Mandatory vs Exempt**:
    - Mandatory for Teaching, Teaching-Related, and Nationally-Funded Non-Teaching staff.
    - `N/A` is allowed only for Non-Nationally Funded Non-Teaching staff (e.g. MOOE Utility, Contract of Service/JO).
  - **Master Agent Skill**: `esf7_agents/deped-email-architect/SKILL.md` (and `.agents/skills/deped-email-architect/SKILL.md`). Test suite: `node esf7_agents/deped-email-architect/scripts/audit_email_validation.js`.
- **Teaching Assignment & Learning Area Full Service Years Rules**:
  - **Teaching Tab (Assigned Grade Levels)**:
    - Mandatory for Teaching and Teaching-Related personnel (`type !== 'non-teaching'`).
    - At least 1 grade level must be assigned (`assignedGradeLevels.length >= 1`).
    - Non-Teaching personnel are strictly exempt (Teaching tab is hidden).
  - **Learning Area Matrix (Full Service Allocation)**:
    - Total teaching experience is calculated dynamically from `firstServiceDate` (`maxYears = currentYear - startYear`).
    - The sum of assigned years across the Learning Area matrix (`totalAssigned`) must **fully account for all service years** (`totalAssigned === maxYears`).
    - Partial allocation (e.g. allocating only 1 year when the teacher has 10 years of service) is strictly prohibited.
    - Saving changes directly, validating, and continuing to Organized Classes are blocked if any faculty has incomplete or under-allocated years.
    - Non-Teaching personnel are strictly exempt (Learning Area tab is hidden).
- **Religion and Ethnic Group Options Clean-up & Removal of OTHERS as Default**:
  - `OTHERS` removed from `RELIGION_OPTIONS` and `ETHNIC_GROUP_OPTIONS` in `client/src/context/AppContext.jsx`.
  - Neither dropdown displays `"OTHERS"` or defaults to `"OTHERS"`. Options strictly consist of official recognized religions and ethnolinguistic groups.
  - Removed `'OTHERS'` fallback default from `server/controllers/personnel/index.js`, `server/queue_worker.js`, and `server/debug_autofill.js` (empty values fall back to `''` instead of `'OTHERS'`).
  - Frontend normalization (`fetchAndNormalizePersonnel`, `autoEnrichPersonnel`, and draft sync) cleans legacy `'OTHERS'` values to empty string `''`.
  - Moved `"OTHERS"` to the end of `HIRING_ARRANGEMENT_OPTIONS` and `POST_GRADUATE_DEGREE_OPTIONS` so no dropdown in the system defaults to `"OTHERS"`.
- **Major, Minor, and PRC Specialization Dropdown Options**:
  - `OTHERS` strictly removed from `MAJOR_OPTIONS`, `MINOR_OPTIONS`, and `PRC_SPECIALIZATION_OPTIONS`. Custom entries are supported via `allowCustom={true}`.
  - `N/A` is added to `MINOR_OPTIONS` (as having no minor is optional/common), but remains excluded from `MAJOR_OPTIONS` and `PRC_SPECIALIZATION_OPTIONS`.
  - Normalization in `AppContext.jsx` and `PersonnelProfile.jsx` sanitizes any legacy `'OTHERS'` in major, minor, or PRC specialization to `''`.
- **Educational Attainment Dynamic Field Rendering**:
  - `effectiveAttainment` is hoisted and consistently computed across `PersonnelProfile.jsx` and `AppContext.jsx`.
  - Even before an explicit attainment option is selected or committed to state, default/fallback attainment (e.g. `COLLEGE GRADUATE / BACCALAUREATE` for teaching faculty, or degrees with Master's/Doctorate/Undergraduate) immediately renders the corresponding conditional fields:
    - `COLLEGE GRADUATE / BACCALAUREATE` & `COLLEGE UNDERGRADUATE`: College Degree, Major in Education (if education degree), Minor (optional).
    - `MASTER'S DEGREE (GRADUATED)` & `DOCTORATE DEGREE (GRADUATED)`: College Degree, Major, Minor, AND Post-Graduate Discipline.
    - `VOCATIONAL / TECH-VOC COURSE`: Vocational / TESDA Course & NC Level.
    - `SENIOR HIGH SCHOOL GRADUATE`: Senior High School Track.
- **Teaching Licensure Examination for Teachers (LET/PBET) Requirement**:
  - **Restriction**: All teaching faculty (`type === 'teaching'` or `positionCategory === 'TEACHING'`) and related-teaching school heads (`position` containing Principal, Head Teacher) must possess `LICENSURE EXAMINATION FOR TEACHERS` (LET) or `PROFESSIONAL BOARD EXAMINATION FOR TEACHERS (PBET)` eligibility.
  - **Form Validation (`getPersonnelValidationErrors`)**: If a teaching faculty member has empty eligibilities or does not include LET/PBET, profile saving and navigation are blocked with error `"Licensure Examination for Teachers (LET/PBET)"` in the Education tab.
  - **Real-Time Issue Tracker (`AppContext.jsx`)**: Flags blocking error `${name}: Teaching personnel must possess Licensure Examination for Teachers (LET/PBET) eligibility.`
  - **Visual UI Cues (`PersonnelProfile.jsx`)**:
    - Asterisk and label clarification: `Eligibilities * (Licensure Examination for Teachers Required)`
    - Inline warning banner: `<FiAlertCircle /> Teaching personnel must possess Licensure Examination for Teachers (LET/PBET) eligibility.`
    - Select dropdown receives `.empty-field` class and red border (`#EF4444`) until LET/PBET is added.
  - **Non-Teaching Exemption**: Non-teaching personnel (`type === 'non-teaching'`) are strictly exempt from this restriction and may have CS eligibilities, TESDA, or N/A.
- **Personnel Profiling, Organized Classes & Designations Sequential Pipeline**:
  - **Sequential Navigation Flow**:
    - `Personnel Profiling` ➔ **`Organized Classes`** (`completeNode('profile', 'classes')`, `"Save & Continue to Organized Classes ➔"`).
    - `Organized Classes` ➔ **`Designations`** (`completeNode('classes', 'designation')`, `"Save & Continue to Designations ➔"`).
    - `Designations` ➔ **`Workload`** (`completeNode('designation', 'workload')`, `"Save & Continue to Workload ➔"`).
  - **DepEd Enrollment Rationale**: Under DepEd staffing guidelines, an Assistant School Head / Assistant Principal Designate is required based on total learner enrollment thresholds. Learner counts and section enrollment are encoded in **Organized Classes**. Placing Organized Classes before Designations ensures that total enrollment is established before the system evaluates whether an Assistant School Head Designate is mandatory.
  - **NodeMap & Sidebar Order**: Aligned to Step 03: Personnel Profiling, Step 04: Organized Classes, Step 05: Designations, Step 06: Workload.
  - **Mandatory Designations Workload Gate**:
    - Progression from Designations to Workload (`Save & Continue to Workload ➔`) is strictly blocked until all required designations are answered:
      1. **Guidance Designate** (`GUIDANCE DESIGNATE`)
      2. **Learner Information Officer** (`LEARNER INFORMATION OFFICER` / `LEARNER FORMATION OFFICER`)
      3. **Department Head Designate** (`DEPARTMENT HEAD DESIGNATE` / `DEPARTMENT HEAD`)
      4. **Assistant School Head Designate** (`ASSISTANT SCHOOL HEAD DESIGNATE`) - strictly mandatory when regular enrollment $\ge 1,001$ learners.
    - If any required designation is vacant, a blocking modal (`Mandatory School Designations Incomplete`) prevents navigation and highlights the vacant roles with direct `"Assign Now"` action buttons.
  - **L&D Total Hours 3-Digit Limit**:
    - Across all Professional Development / Training sections (NEAP Trainings, TESDA Certifications, Other Trainings in both `PersonnelProfile.jsx` and `RoomProfiling.jsx`), total hours input is strictly capped at **3 digits (1 - 999 hours)**.
    - Sliced on input, clamped in handlers (`slice(0, 3)`), and validated in form errors and real-time audit issues. Numbers $> 999$ or non-digits are strictly prevented.
- **Designations Management UI Architecture (Option A Redesign)**:
  - **Problem Solved**: Eliminated the overwhelming 16-card catalogue with vacant/blank cards across the screen. Replaced with an agile, streamlined 2-tier architecture.
  - **Tier 1: Core School Designations**:
    - Pre-loads standard leadership/student support slots at the top (Guidance, LIO, Department Head, and Assistant School Head if enrollment >= 1,001).
    - Removed the loud "2/3 Assigned" banner so users do not feel constrained to only filling 3 roles.
    - If assigned: Displays teacher avatar, name, position, clean inline switch toggle for `APPROVED BY SDS` / `APPROVE BY SDS`, and `Remove ✕` button.
    - If vacant: Provides a clean inline `<SearchableDropdown>` for direct teacher assignment without intrusive red alert banners.
  - **Tier 2: Dynamic School Coordinators (`+ Add Designation`)**:
    - Features a vibrant, glowing `[ + Add Designation ]` button equipped with continuous CSS pulse glow and an active cyan blinking beacon dot to draw user attention.
    - High-Engagement Empty State: Includes quick-pick interactive chips (`📖 Reading Coordinator`, `💻 ICT Coordinator`, `👥 Grade Level Chair`, `🏆 Sports`, `🔬 Research`, `🧩 SNED`, `🏛️ SELG/SSLG`) that immediately open the assignment modal with that role pre-selected, plus a prominent glowing central button.
    - Active Cards: Displays cleanly formatted cards showing designation category, parameter pill (e.g. `GRADE 1`, `ENGLISH`), assigned teacher info, SDS approval switch, and unassign button.
  - **Validation Gate Intact**: The `handleContinueToWorkload` gate ensures all mandatory roles are satisfied before navigating to Workload. Missing roles trigger the blocking modal with smooth scroll to the vacant slot.
- **Designations & Workload Dynamic Auto-Sync Connection**:
  - **Teaching-Related Tasks Auto-Population**:
    - When a teacher is assigned an official designation in the `Designations` portal (e.g. `GUIDANCE DESIGNATE`, `LEARNER INFORMATION OFFICER`, `READING COORDINATOR`, `DEPARTMENT HEAD`, etc.), that designation automatically syncs into their `teachingRelatedRows` in `Workload.jsx`.
    - Both `currentPerson.designation` and `currentPerson.designations` array (with or without `::APPROVED_SDS`) are supported and extracted.
  - **Locked Designation Status**:
    - Synced designation tasks are **LOCKED** in Workload (`isDesignation: true`).
    - Users cannot modify the task title or delete the designation task row from inside Workload. To unassign a designation, it must be unassigned in the **Designations** tab.
    - When unassigned in Designations, the task row is automatically purged from `teachingRelatedRows`.
    - Visual indicators: `🔒 [Task Name]`, `Official Designation · Locked` pill, and `[✓ SDS Endorsed]` badge if SDS approval was granted.
  - **Removal of Manual `+ Add task` Button**:
    - The manual `+ Add task` button in Teaching-Related Tasks has been permanently removed. All teaching-related duties originate from official designations.
    - A `"Manage Designations"` button in the section header allows 1-click navigation to the Designations portal (`setActiveView('designation')`).
    - If no designations are assigned to the teacher, a clean empty state directs the user to `"Assign Designation Now ➔"`.
  - **Administrative Tasks Strictly Independent**:
    - Administrative Tasks (`administrativeRows`) remain completely unaffected and retain their manual `+ Add task` button for encoding administrative responsibilities.
  - **Cadence & Allocated Hours Controller**:
    - Each Teaching-Related Task card allows choosing an execution cadence: `Daily`, `Weekly`, or `Monthly`.
    - Teachers input their allocated hours (min 0.5, step 0.5).
    - Weekly equivalent hours automatically feed into `baseWeeklyRelatedHours` and the overall teacher workload totals:
      - Daily: $h \times 5$ hrs/wk
      - Weekly: $h$ hrs/wk
      - Monthly: $h \times \frac{9}{34}$ hrs/wk
  - **Live Term Summary Bar**:
    - Displays a live calculation of allocated hours per term aligned with the DepEd 3-Term academic calendar (34 instructional weeks / 170 school days / 9 report months):
      - **Daily**: Term 1 = $12 \times 5 \times h$ hrs (60 days), Term 2 = $11 \times 5 \times h$ hrs (55 days), Term 3 = $11 \times 5 \times h$ hrs (55 days), Annual Total = $170 \times h$ hrs.
      - **Weekly**: Term 1 = $12 \times h$ hrs, Term 2 = $11 \times h$ hrs, Term 3 = $11 \times h$ hrs, Annual Total = $34 \times h$ hrs.
      - **Monthly**: Term 1 = $3 \times h$ hrs, Term 2 = $3 \times h$ hrs, Term 3 = $3 \times h$ hrs, Annual Total = $9 \times h$ hrs.
    - An aggregate banner displays the combined workload across all teaching-related tasks if the teacher holds multiple designations.

### Added 2026-09-07
- **Inclusive Education Offerings & Workload Subject Isolation**:
  - **Question in School Profile**:
    - Question: *"Does this school offer ALS / SNED / IP and MADRASAH?"*
    - Nested directly inside each Educational Level card (Elementary, Junior High School, Senior High School).
    - If user toggles YES, options are selected and tagged per level:
      - **Elementary**: `ALS-ES`, `SNED-ES`, `IPED-ES`, `MADRASAH-ES`
      - **Junior High School**: `ALS-JHS`, `SNED-JHS`, `IPED-JHS`, `MADRASAH-JHS`
      - **Senior High School**: `ALS-SHS`, `SNED-SHS`, `IPED-SHS`
  - **Organized Classes Grade Level Additions**:
    - When `ALS-ES`, `ALS-JHS`, or `ALS-SHS` is active, `ALS` is dynamically added as a selectable Grade Level option under Regular Section creation.
    - When `SNED-ES`, `SNED-JHS`, or `SNED-SHS` is active, `SNED` is dynamically added as a selectable Grade Level option under Regular Section creation.
  - **Workload Subject Rules & Isolation**:
    - **SNED Sections**:
      - If a section's Grade Level is `SNED`, the subject dropdown in `Workload.jsx` strictly and exclusively shows **`SPED MODIFIED SUBJECTS` ONLY**. All other standard subjects are filtered out.
    - **ALS Sections**:
      - If a section's Grade Level is `ALS`, the subject dropdown displays regular standard Grade 7–10 subjects (or regular elementary subjects for ES).
    - **IP Related Subjects**:
      - `IP RELATED SUBJECT` is strictly hidden in Workload unless the school profile has enabled IP offerings (`IPED-ES`, `IPED-JHS`, or `IPED-SHS`).
    - **Madrasah Subjects**:
      - `MADRASAH SUBJECTS` is strictly hidden in Workload unless the school profile has enabled Madrasah offerings (`MADRASAH-ES` or `MADRASAH-JHS`).
  - **ALS Exclusion from Total Enrollment**:
    - **Total School Enrollment & Regular Enrollment**: Learners enrolled in `ALS` sections are strictly **excluded** from base school total enrollment (`totalSchool`, `totalMale`, `totalFemale` in `OrganizedClasses.jsx`) and regular sections enrollment (`getRegularSectionsEnrollment` in `AppContext.jsx` and `Designations.jsx`).
    - **Rationale**: In DepEd staffing and classification rules, Alternative Learning System (ALS) is a parallel learning system with non-formal modular instruction and separate funding/staffing streams; ALS learners do not factor into regular base school enrollment thresholds (such as the 1,001 learner threshold for mandatory Assistant School Head Designate).
    - **UI Indicator**: ALS section cards display an informative note: *"Alternative Learning System (ALS) · Not counted in base school total enrollment"*.
  - **ARAL Subject Isolation & Catalog Removal**:
    - **ARAL Sections**: When a section is an ARAL section (created under ARAL Section tab in `OrganizedClasses.jsx`, or `sectionType` starts with `ARAL`, or section name / grade level contains `ARAL`), the subject dropdown in `Workload.jsx` strictly displays **ARAL subjects ONLY** (`ARAL - READING`, `ARAL - MATH`, `ARAL - SCIENCE`).
    - **Regular Sections**: ARAL subjects (`ARAL - READING`, `ARAL - MATH`, `ARAL - SCIENCE`, `ARAL TUTORING`) are permanently **removed and filtered out** from the subject dropdowns of all regular, non-ARAL grade levels in `Workload.jsx`, `OrganizedClasses.jsx`, and `AppContext.jsx` (`isSpecialProgramSubjectAllowed`). Standard grade classes cannot be assigned ARAL subjects.

### Added 2026-09-08
- **PhilSys No. / National ID Rules**:
  - **Not Required**: PhilSys No. / National ID is optional and not strictly required for 100% profile validation or saving.
  - **N/A Checkbox**: Added an N/A checkbox next to the PhilSys input. When checked, disables the input, clears any entered value, and flags `noPhilsys: true` / `no_philsys: true`.
  - **Database Persistence**: Column `no_philsys BOOLEAN NOT NULL DEFAULT FALSE` in table `esf7_personnel_profile`. Fully mapped across frontend state, AppContext update payload, controller, and queue worker.
  - **Duplicate Check Safeguard**: PhilSys duplicate detection only checks against other records when `p.philsysNo` is non-empty and `noPhilsys` is false.
- **Employment Role & Appointment Reordering & Cascading Matrix**:
  - **Field Order**: 1. `Nature of Appointment` -> 2. `Hiring Arrangement / Special Program` -> 3. `Fund Source`.
  - **Regular Permanent**:
    - Teaching: Hiring Arrangement permits `REGULAR`, `SPIMS`, `4PS`, `DOST`. Fund Source is locked to `NATIONAL`.
    - Non-Teaching: Hiring Arrangement is locked to `REGULAR`. Fund Source is locked to `NATIONAL`.
  - **Provisional**:
    - Restricted to Teaching personnel only. Hiring Arrangement is locked to `DOST`. Fund Source is locked to `NATIONAL`.
  - **Non-Permanent Appointments** (`CONTRACTUAL`, `SUBSTITUTE`, `CASUAL/EMERGENCY`, `JOB ORDER/CONTRACT OF SERVICE`, `VOLUNTEER`):
    - `SUBSTITUTE` is restricted to Teaching personnel only.
    - Hiring Arrangement is locked to `N/A`.
    - Fund Source strictly provides local/partner funds (`SEF`, `LGU`, `PTA`, `NGO`, `SCHOOL MOOE`) and excludes `NATIONAL`.

### Added 2026-09-09: Overload Computation, School Calendar Term Blocks & FY Quarterly Mapping
- **Core Principle**: Overload computation is strictly per **School Calendar Term**, while filtering in Step 6 supports both **Term** and **Fiscal Year Quarter (FY)**.
- **End-of-Term Exclusion Rule**:
  - During **End-of-Term blocks** (and Vacation blocks), regular classroom contact instruction ceases.
  - **No Overload Pay is earned during End-of-Term and Vacation dates**.
  - All days within End-of-Term and Vacation ranges are strictly **excluded** (0 hours) from Overload calculations and workdays aggregation.
- **Official DepEd 3-Term School Calendar Schedule (SY 2026-2027)**:
  - **Term 1**:
    - *Opening & Instructional Block*: **June 8 – September 1, 2026** (Overload ACTIVE)
    - *End-of-Term Block*: **September 2 – September 15, 2026** (Overload EXCLUDED / 0h)
  - **Term 2**:
    - *Instructional Block*: **September 16 – December 4, 2026** (Overload ACTIVE)
    - *End-of-Term Block*: **December 7 – December 18, 2026** (Overload EXCLUDED / 0h)
    - *Holiday Break*: **December 19, 2026 – January 3, 2027** (Overload EXCLUDED / 0h)
  - **Term 3**:
    - *Instructional Block*: **January 4 – March 23, 2027** (Overload ACTIVE)
    - *End-of-Term Block*: **March 24 – April 8, 2027** (Overload EXCLUDED / 0h)
  - **Vacation / EOSY**:
    - **April 9 – June 6, 2027** (Overload EXCLUDED / 0h)
- **Fiscal Year (FY) Quarterly Mapping**:
  - **FY Q1**: January, February, March (maps to Term 3 instructional block Jan 4 – Mar 23).
  - **FY Q2**: April, May, June (maps to Term 1 instructional block June 8 – June 30).
  - **FY Q3**: July, August, September (maps to Term 1: July 1 – Sept 1; and Term 2: Sept 16 – Sept 30; Sept 2–15 is excluded).
  - **FY Q4**: October, November, December (maps to Term 2: Oct 1 – Dec 4; Dec 7–31 is excluded).
- **Step 6 Table View Layout**:
  - Remove daily and weekly granular columns from the main roster view.
  - Display **Monthly breakdown columns** (e.g. Month 1, Month 2, Month 3 of the selected Term/Quarter) followed by the **Total Net Hours Per Term / Quarter** and **Total Overload Pay (₱)**.

### Added 2026-09-14: Database Field Verification & Backend Testing Protocol
- **Backend & Route Architecture (`server/server.js`)**:
  - Central express dispatcher managing 30+ modular controller endpoints with `50mb` payload parsing and CORS.
  - Self-healing schema engine (`initDB`) ensuring `schema.sql` synchronizes table definitions on boot.
  - Local submission queue worker (`queue_worker.js`) executing transactional ingestion (`BEGIN` / `COMMIT` / `ROLLBACK`).
- **Database Schema Core (21 Tables)**:
  - Alphanumeric String IDs (`VARCHAR(50)`) across all relational entities, with `salary_matrix` and `esf7_submission_queue` utilizing auto-incrementing serial PKs.
  - Mandatory `raw_payload JSONB` on all entity tables ensuring lossless payload retention and zero frontend drift.
  - Full relational cascade constraints (`ON DELETE CASCADE` / `ON DELETE SET NULL`) linking personnel profile children, class sections, and overload deduction logs.