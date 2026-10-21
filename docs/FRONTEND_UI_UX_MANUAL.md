# InsightED eSF7 Frontend Architecture & UI/UX Manual

> **Repository:** `InsightED - ESF7 Official`  
> **Target Audience:** Frontend Engineers, System Architects, DepEd UI/UX Reviewers, and QA Teams.  
> **Scope:** End-to-End User Interface, Visual Hierarchy, Interaction Patterns, State Management, and Journey Workflows from **Authentication (Login) through Node 09 (Validation & Certification)**.

---

## 🎨 Global Design System & UI Foundations

### 1. Visual Aesthetics & Design Contract
The InsightED eSF7 frontend adheres to a modern, high-trust government enterprise aesthetic:
* **Typography:** Modern variable font family (`'Plus Jakarta Sans'`, `'Inter'`, sans-serif) with high-legibility tabular numerals for timestamps, salary amounts, and timetable schedules.
* **Blueprint Aesthetic (`BlueprintBackground.jsx`)**:
  - Subtle architectural blueprint background featuring isometric grid lines, engineering crosshairs, and dynamic contour curves symbolizing structural precision.
* **Component Palette & Accents**:
  - Primary Brand Blue: `#2563EB` / `#1D4ED8` (DepEd institutional trust).
  - Elementary Emerald: `#10B981` (Kinder to Grade 6).
  - Junior High Cobalt: `#3B82F6` (Grade 7 to Grade 10).
  - Senior High Violet: `#8B5CF6` (Grade 11 to Grade 12).
  - Error Red: `#EF4444` (Blocking hard errors and validation failures).
  - Warning Amber: `#F59E0B` (Soft advisories and pending handshakes).
  - Neutral Slate Surfaces: `#F8FAFC` background, `#FFFFFF` cards, `#E2E8F0` borders.
* **Iconography Standard (`react-icons/fi`)**:
  - Strictly uses the Feather Icon set (`Fi*`). Emojis and mismatched icon sets are prohibited in UI action controls.

---

### 2. Standard Header System (`PortalHeader.jsx`)
Every main journey screen features a unified, responsive header layout:
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ DEPARTMENT OF EDUCATION                                                         │
│ PROGRESSIVE JOURNEY ROADMAP • CEBU NATIONAL HIGH SCHOOL (108348)                │
│                                                                                 │
│ Node Title (e.g. Organized Classes & Section Setup)     [ Back to Dashboard ]   │
│ Detailed description of the operational scope...         [ Primary Action Btn ]  │
└─────────────────────────────────────────────────────────────────────────────────┘
```
* **Department & Bureau Hierarchy**: Identifies national DepEd context and current school entity.
* **Navigation Safeguard**: Includes breadcrumb or back action, plus sticky contextual action buttons (e.g. Save Draft, Add Personnel, Generate Poster).

---

### 3. Data Safety & Dirty-Guard Protocol (`useDirtyGuard.js`)
* **Local-First IndexedDB Write Buffering**: User inputs write instantly to local IndexedDB to eliminate keystroke latency.
* **Dirty State Detection**: Compares active form snapshots against `savedSnapshotRef`. Unsaved changes display visual dirty indicators.
* **Navigation Interceptors**: Attempting to switch views, reload, or navigate away with pending unsaved changes triggers the Unsaved Changes Modal with options to **Save Changes**, **Discard**, or **Stay on Page**.

---

## 🔐 00. Authentication & Entry Portal (`Login.jsx`, `Landing.jsx`)

### 1. Layout & Architecture
* **Component Path:** [`client/src/pages/Login.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Login.jsx)
* **Visual Shell:** Centered floating glassmorphism modal card (`maxWidth: 1000px`, `borderRadius: 2.5rem`) rendered above the animated `BlueprintBackground`.

### 2. Authentication Modes
1. **6-Digit Passcode PIN Deck (`loginMode === 'passcode'`)**:
   - Primary School Head login method.
   - Interactive 6-box OTP-style PIN input with automatic auto-focus progression, backspace handling, and numeric validation.
   - Supports numeric keypad clicks via `PasscodeDeck.jsx` or direct physical keyboard entry.
2. **Standard Password Mode (`loginMode === 'password'`)**:
   - Secondary fallback for division administrators, auditor accounts, and IT personnel.
   - Captures School ID / Email identifier and password with show/hide password toggle.

### 3. Account Remembering & Switching
* Successful login stores user session in `localStorage` (`remembered_user`).
* Returning users are greeted with a quick 1-click avatar card displaying school name, ID, and division, enabling rapid PIN re-entry without retyping School ID.
* "Switch Account" button allows logging out and resetting credentials.

### 4. SDO Division Test Accounts & MCOC Archetypes
* **230 SDO Division Test Accounts (`900001`–`900230`)**:
  - Format: `<region>.<division>.test` (e.g. `rcar.benguet.test`, `rncr.pasig.test`).
  - Interchangeable with/without "City" slug (`r7.naga.test` $\equiv$ `r7.nagacity.test`).
* **7 MCOC Archetype Accounts (`900223`–`900229`)**:
  - `mcoc.elem.test` (Elementary SSES), `mcoc.jhs.test` (Junior High), `mcoc.shs.test` (Senior High), `mcoc.integrated.test` (K-10), `mcoc.multigrade.test` (MG ES), `mcoc.k12.test` (Comprehensive), `mcoc.inclusive.test` (SNED/ALS).
  - Universal test passcode: `123456`.
* **Strict Staging Isolation**: Test logins route queries exclusively to `insighted_esf7_staging` via `getPoolForSchool()`.

---

## 📊 00B. School Dashboard & Process Map (`Dashboard.jsx`, `NodeMap.jsx`)

### 1. School Dashboard (`Dashboard.jsx`)
* **Component Path:** [`client/src/pages/Dashboard.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Dashboard.jsx)
* **Key Visual Blocks**:
  1. **School Header Banner**: Displays School Name, 6-digit School ID, Division, and Active School Year badge (`SY 26-27`).
  2. **Core Metric Stat Cards**:
     - *Total Personnel*: Registered staff count with category pill breakdown (Teaching, Teaching-Related, Non-Teaching).
     - *Organized Classes*: Total class sections count.
     - *Inter-School Requests*: Pending incoming/outgoing reassignment notifications badge.
     - *Overall eSF7 Progress*: Live circular completion meter.
  3. **Historical eSF7 Ingestion Banner (`ESF7UploadModal.jsx`)**:
     - For schools without digitized records, prompts the School Head to upload their prior-year `.xlsb` / `.xlsx` spreadsheet for automated background personnel harvesting.
  4. **Quick Navigation Tiles**: Direct shortcut cards into Roster, Classes, Workload, and Validation.

---

### 2. Journey Process Map (`NodeMap.jsx`)
* **Component Path:** [`client/src/pages/NodeMap.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/NodeMap.jsx)
* **3-Phase Layout**:
  - **Phase 1: School Setup & Faculty Profiling** (Nodes 01, 02, 03).
  - **Phase 2: Academic Structuring & Timetable** (Nodes 04, 05, 06).
  - **Phase 3: Compensation & Final Submission** (Nodes 07, 08, 09).
* **Node Card States**:
  - `COMPLETED`: Green checkmark icon with summary metrics (e.g. "42 Registered Personnel").
  - `IN_PROGRESS` / `UNLOCKED`: Active blue play icon with contextual call to action.
  - `LOCKED`: Padlock icon requiring preceding nodes to be completed.
  - *Developer Bypass Toggle*: Secret/dev toggle to unlock all nodes during system audits.

---

## 📘 NODE 01: School Profile Screen (`SchoolProfile.jsx`)

### 1. Layout & Visual Composition
* **Component Path:** [`client/src/pages/SchoolProfile.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/SchoolProfile.jsx)
* **Two-Column Split Layout**:
  - **Left Column (School Identity & Offerings)**: Pre-filled DepEd school metadata, MCOC badges, Special Programs, and Inclusive Education checkboxes.
  - **Right Column (Shift Configuration)**: Mandatory grade-by-grade shift assignment cards and instructional day window sliders.

### 2. Interactive Components & Controls
1. **MCOC Level Badges**: Visual cards for *Elementary*, *Junior High School*, and *Senior High School*. Toggling levels automatically recalibrates `offeredGradeLevels`.
2. **Special Programs Selector**:
   - Elementary: `SSES` (Special Science Elementary School).
   - JHS Special Curricular Programs: Interactive toggle chips for `SPA`, `SPFL`, `SPJ`, `SPS`, `STE`, `SPTVE`, and `SCIENCE`.
   - Feature Callout: Unconfigured special programs pulse with an animated blue spotlight glow (`special-programs-glowing`).
3. **Inclusive Education Stage Checkboxes**:
   - Dedicated pills for `SNED`, `ALS`, `IPED`, and `MADRASAH` tagged by stage (`-ES`, `-JHS`, `-SHS`).
4. **School Shift Schedule Matrix (`shiftsConfig`)**:
   - Grade level cards (Kinder through Grade 12).
   - Mutually exclusive pills per grade: `Single Shift`, `Double Shift`, `Triple Shift`.
   - **"Apply to all: Single Shift"**: 1-click bulk configuration toolbar button.
   - Counter: Displays configured grades vs required grades (e.g., `12 / 13 grade levels configured`).
5. **Typed-CONFIRM Modal Barrier**:
   - Clicking Header Save opens a modal requiring the user to type `"CONFIRM"` before changes commit to `esf7_school_profile`.

---

## 👥 NODE 02: Personnel Roster Screen (`Roster.jsx`)

### 1. Layout & Master Table Controls
* **Component Path:** [`client/src/pages/Roster.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Roster.jsx)
* **Header Toolbar**:
  - Category Filter Tabs: `All Personnel`, `Teaching`, `Teaching-Related`, `Non-Teaching`.
  - Live Search Bar: Instant client-side filtering across Name, Position, TIN, and DepEd Email.
  - Action Buttons: `+ Add Personnel`, `Faculty Room QR Portal`, `Save Changes`.

### 2. Master Table Columns & Interactive Features
1. **School Head Star Icon (`isSchoolHead`)**:
   - Golden star icon next to the primary school head.
   - Clicking allows designating the accountable head, automatically unchecking conflicting Principals.
2. **Personnel Name & Position**:
   - Displays full legal name with verified birthdate and computed age pill.
   - Canonical Plantilla position dropdown badge.
3. **Identifiers (TIN & DepEd Email)**:
   - Formatted TIN with warning indicator if missing.
   - Validated `@deped.gov.ph` email badge with maiden name discrepancy indicator.
4. **Nature of Appointment & Fund Source**:
   - Badges for `REGULAR PERMANENT`, `PROVISIONAL`, `CONTRACTUAL`.
   - Special badge for `SBFP` (locked to COOK).
5. **Deployment Status**:
   - Badges for `OWN STATION`, `REASSIGNED`, `BORROWED`, `CLUSTERED`.
6. **Animated Gulp Trash Row (`GulpTrashRow.jsx`)**:
   - Deleting a personnel row triggers a custom flying particle animation where the teacher's card animates into a wastebasket icon before removal.

### 3. "Add Personnel" Modal Drawer
* Form tabs: Basic Identity (Name, Sex, Civil Status, Birthdate), Employment (Position, Category, Appointment, Fund Source, TIN), and Official Contact (DepEd Email or "No DepEd Email" toggle).

---

## 🎓 NODE 03: Personnel Profiling (`PersonnelProfile.jsx`, `RoomQR.jsx`, `RoomProfiling.jsx`)

### 1. Profiling Layout (`PersonnelProfile.jsx`)
* **Component Path:** [`client/src/pages/PersonnelProfile.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/PersonnelProfile.jsx)
* **Master-Detail Layout**:
  - **Left Rail**: Searchable teacher list with completion percentages (e.g. `100% Complete`, `75% Incomplete`) and active teacher selector.
  - **Right Workspace**: Tabbed profile editing pane.

### 2. The 6 Tabbed Profiling Modules
1. **Personal Information**: Legal Name, Sex at Birth, Civil Status, Religion, Ethnic Group, Birthdate, PhilSys ID.
2. **Plantilla & Employment**: Plantilla Item Number, Position Title, Salary Grade, Step Increment (1–8), Nature of Appointment, Fund Source, First Service Date, Last Promotion Date.
3. **Educational Background**:
   - College Degree / Baccalaureate (Major & Minor inputs).
   - Post-Graduate Degrees: Masteral / Doctoral degree rows with `[GRADUATED]` or `[WITH UNITS]` chips.
4. **Civil Service Eligibility & PRC**:
   - Eligibility checkboxes (`LET`, `PBET`, `CS Professional`, `CS Sub-Professional`).
   - PRC License Number, Registration Date, and PRC Specialization dropdown.
5. **Learning Area Specialization Matrix**:
   - Grid of DepEd learning areas with checkboxes and years-allocated counters.
   - Displays real-time validation meter: `Total Assigned Years / Required Years`.
6. **Professional Development (L&D Seminars)**:
   - Dynamic table rows capturing NEAP and Division seminar titles, dates, and total hours (1–999).

### 3. Faculty Room QR Mobile Interface (`RoomProfiling.jsx`)
* **Component Path:** [`client/src/pages/RoomProfiling.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/RoomProfiling.jsx)
* **Mobile-Optimized PWA Layout**:
  - Clean vertical flow designed specifically for smartphone screens.
  - **2-Step 3-Factor Gate**:
    - *Step 1*: Big 8-digit numeric/letter passcode input box.
    - *Step 2*: Surname input + 4-digit Birth Year input.
  - **Locked Profile Mode**: Unlocks only the authenticated teacher's profile. Zero roster names or peer records are visible.
  - **Lockout Screen**: 3 failed attempts renders a red countdown shield locking entry for 10 minutes.

---

## 🏫 NODE 04: Organized Classes & Sections (`OrganizedClasses.jsx`)

### 1. 5-Card Layout Structure
* **Component Path:** [`client/src/pages/OrganizedClasses.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/OrganizedClasses.jsx)
* **Visual Card Arrangement**:
  - **Row 1 (Full Width)**: `REGULAR CLASSES` (Mono-grade & Multi-grade sections).
  - **Row 2 (2 Columns)**:
    - *Left*: `SNED (NON-GRADED)` (Special needs classrooms).
    - *Right*: `ALTERNATIVE LEARNING SYSTEM (ALS)` (Community learning cohorts).
  - **Row 3 (2 Columns)**:
    - *Left*: `ARAL PROGRAM (RA 12028)` (Academic Recovery cohorts).
    - *Right*: `REMEDIAL / ENRICHMENT` (Subject remediation cohorts).

### 2. Section Cards & Inline Editor
* Each section card displays: Section Name, Grade Level badge, Shift schedule pill, Male count, Female count, and Total Enrollment pill.
* **Inline Creation & Edit Modal**:
  - Grade Level dropdown (filtered strictly to school MCOC).
  - Class Type selector: `MONO GRADE` vs `MULTI GRADE` (Elementary only).
  - Section Name input.
  - Male & Female learner count number steppers.
  - **Qualified Adviser Dropdown**: Lists eligible teachers with their current assigned load; warns if an adviser is already assigned to another regular section.

---

## 🎖️ NODE 05: Designations & Duties (`Designations.jsx`)

### 1. Layout & Key Stage Cards
* **Component Path:** [`client/src/pages/Designations.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Designations.jsx)
* **MATATAG Key Stage Grid**:
  1. **Key Stage 1 (K–3)**: Primary literacy & numeracy chairperson card.
  2. **Key Stage 2 (4–6)**: 8 Learning Area Department Head cards (English, Math, Science, Filipino, AP, EPP, MAPEH, GMRC).
  3. **Key Stage 3 (7–10)**: 8 Secondary Learning Area Department Head cards.
  4. **Key Stage 4 (11–12)**: Academic Track & Tech-Pro / TVL Track cards.

### 2. Interactive Role Assignment & Banners
* **1,001+ Student Rule Alert Banner**: Appears automatically in gold/amber when regular enrollment reaches 1,001, reminding the user to assign an Assistant School Head Designate.
* **Role Assignment Drawer**: Clicking a designation opens a side panel listing available teachers, their current teaching minutes, and an assignment confirmation button.
* **SDS Approval Badge (`::APPROVED_SDS`)**: Displays a blue certified badge next to roles verified by the Schools Division Superintendent.

---

## ⏰ NODE 06: Workload & Timetable (`Workload.jsx`)

### 1. Interactive Gantt Schedule Grid
* **Component Path:** [`client/src/pages/Workload.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Workload.jsx)
* **Visual Timetable Architecture**:
  - **Horizontal Time Axis**: 5-minute increments spanning the instructional window (4:00 AM to 10:00 PM).
  - **Vertical Day Axis**: Monday through Friday rows.
  - **Color-Coded Subject Blocks**: Distinct colors for core subjects (Math, Science, English, MAPEH, TLE, etc.).
  - **Time Slider & Duration Steppers**: Allows dragging or selecting subject start/end times.

### 2. Term Switcher & Working Hours Meters
* **3-Term Tabs**: Seamlessly toggle between `1st Term`, `2nd Term`, and `3rd Term`.
* **Live Daily Load Meters**:
  - *Actual Classroom Teaching*: Meter tracks daily minutes against the **360-minute (6-hour) statutory ceiling**. Exceeding 360 minutes highlights in purple (Overload zone).
  - *Ancillary & Preparation Time*: Meter tracks daily preparation against the 120-minute allocation.
* **Real-Time Schedule Collision Banners**:
  - Red warning banner instantly flashes if a teacher is double-booked or a section is scheduled for two subjects simultaneously.
* **Clustered Ghost Sync Overlay**:
  - Clustered teachers display cross-hatched locked slots representing their timetable at the partner school.

---

## 💰 NODE 07: Allowances & Financial Incentives (`Allowances.jsx`)

### 1. Layout & Matrix Table
* **Component Path:** [`client/src/pages/Allowances.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Allowances.jsx)
* **Header Toolbar**:
  - Category Pills: `All Personnel`, `Teaching`, `Teaching-Related`, `Non-Teaching`.
  - Search input.
  - Bulk Action Buttons: "Select All Uniform", "Select All Supplies", "Clear All".

### 2. Allowance Columns & Interactive Toggles
* **Table Columns**: Personnel Name, Plantilla Position, Category Badge, and 4 Allowance Checkbox Columns:
  1. `Uniform Allowance` (Clothing)
  2. `Teaching Supplies` (RA 11997 Cash Allowance — disabled for non-teaching)
  3. `Medical Allowance` (Fixed ₱7,000 subsidy)
  4. `Special Hardship Allowance (SHA)`
* **Per-Personnel Disabling Action**: Clicking the lock/ban icon disables specific allowances for ineligible teachers (`isAllowanceDisabled`).

---

## 📈 NODE 08: Teaching Overload Center (`Overload.jsx`)

### 1. 6-Step Overload Computation Wizard
* **Component Path:** [`client/src/pages/Overload.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Overload.jsx)
* **Stepper Navigation**:
  - **Step 1 (Eligibility)**: Filters exclusively to teaching personnel with $>360$ minutes daily contact time.
  - **Step 2 (Period Mode)**: Toggle between **School Calendar Terms** (`Term 1`, `Term 2`, `Term 3`) and **Fiscal Year Quarters** (`FY Q1`, `FY Q2`, `FY Q3`, `FY Q4`).
  - **Step 3 (Calendar Review)**: Visual calendar highlighting active instructional days vs zero-overload End-of-Term / Vacation blocks.
  - **Step 4 (Absence Adjustments)**: Input daily absence deductions.
  - **Step 5 (PHTR Rates)**: Table calculating the exact Per Hour Teaching Rate ($0.000781 \times 12 \times \text{Salary}$).
  - **Step 6 (Payroll Summary)**: Net Overload Hours $\times$ PHTR = Computed Overload Pay (₱).

### 2. Official Payroll Export & Print Preview
* Features an official DepEd printable payroll voucher layout formatted for division accounting liquidation.

---

## 🛡️ NODE 09: Validation Center & Digital Certification (`ValidationCenter.jsx`, `Submission.jsx`)

### 1. Dual-Column Audit Panel
* **Component Path:** [`client/src/pages/ValidationCenter.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/ValidationCenter.jsx)
* **Left Overview Panel**:
  - Audit status card (e.g. `14 Hard Errors`, `3 Warnings`).
  - Metric breakdown of ready vs incomplete teacher records.
* **Right Issue Feed**:
  - **Red Hard Error Cards**: Displays rule violation, affected teacher/section name, and a prominent **"Fix Now"** button that automatically navigates directly to the exact field in the failing node.
  - **Amber Soft Warning Cards**: Non-blocking advisories.

### 2. Digital Certification & E-Signature Pad
* **School Head Oath Modal**: Displays the official legal declaration under oath.
* **Signature Input Selector**:
  - *Draw Mode*: Interactive HTML5 canvas signature drawing pad with clear and stroke controls.
  - *Upload Mode*: Image file picker for scanned signatures.
  - *Type Mode*: Stylized script font signature generator.

### 3. Submission Flow & Celebratory Lock (`Submission.jsx`)
* Clicking "Certify & Submit eSF7" triggers the transactional queue worker.
* **Success Modal**: Renders a celebratory confetti animation modal displaying Job ID, submission timestamp, certified principal name, and school year.
* **Read-Only Archival Lock**: The UI transitions all input fields, tables, and buttons across Nodes 01–09 into a secure read-only state.

---

*(End of Frontend Manual — InsightED ESF7 Official Specification)*
