# DepEd eSF7 Rules & Business Logic Manual

> **Repository:** `InsightED - ESF7 Official`  
> **Source of Truth:** DepEd Orders (DO), DepEd Memoranda (DM), Republic Acts (RA 4670, RA 10533, RA 11713, RA 11997, RA 12028), DepEd eSF7 Technical Manual, and Production Codebase Logic.  
> **Architecture Scope:** Comprehensive Node-by-Node Specification across all 9 Journey Nodes.

---

## 🗺️ Progressive Journey Roadmap (Nodes 1 – 9)

The Electronic School Form 7 (eSF7) in InsightED is partitioned into **9 sequential, interdependent nodes** across 3 distinct implementation phases:

| Phase | Node # | Node Key / View | Module Name | Primary DepEd Mandate / Function |
| :--- | :---: | :--- | :--- | :--- |
| **Phase 1: School Setup & Faculty Profiling** | **01** | `school` | **School Profile** | School identity, MCOC curricular boundaries, special programs, inclusive education, and mandatory shift schedules. |
| | **02** | `roster` | **Personnel Roster** | Master staffing list, appointment nature, DepEd email validation, single School Head restriction, and Room QR passcodes. |
| | **03** | `profile` | **Personnel Profiling** | Educational attainment, PRC LET licensing, specialization matrix, salary grade/step increment, and mobile 3-factor authentication. |
| **Phase 2: Academic Structuring & Timetable** | **04** | `classes` | **Organized Classes** | 5-card class layout (Regular, SNED Non-Graded, ALS, ARAL, Remedial), MCOC grade resolution, enrollment counts, and adviser assignment. |
| | **05** | `designation` | **Designations & Duties** | Ancillary roles, Key Stages 1–4 department heads, 1,001+ student rule, SDS official approvals, and non-teaching coordinator assignments. |
| | **06** | `workload` | **Workload & Timetable** | 360-min teaching daily limit, HGP advisory rules, 3-term academic schedule, schedule collision checks, and administrative task quotas. |
| **Phase 3: Compensation & Final Submission** | **07** | `allowances` | **Allowances & Incentives** | Clothing allowance, Cash supplies allowance (RA 11997), Medical allowance, Special Hardship Allowance (SHA), and disabling rules. |
| | **08** | `overload` | **Teaching Overload Center** | DepEd Teaching Overload formula ($0.000781 \times 12 \times \text{Salary}$), Magna Carta (RA 4670) compliance, FY quarterly reporting, and liquidation payroll. |
| | **09** | `validation` | **Validation & Certification** | DepEd multi-tier error engine (hard errors vs soft warnings), School Head digital oath certification, and locked eSF7 export. |

---

## 📘 NODE 01: School Profile & Curricular Offerings

### 1. Architectural Scope & File Mapping
* **Primary Frontend Screen:** [`client/src/pages/SchoolProfile.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/SchoolProfile.jsx)
* **Global Context & Journey Lock:** [`client/src/context/AppContext.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/context/AppContext.jsx) (`isNodeCompleted("school")`, `completeNode("school")`)
* **Backend Controller:** [`server/controllers/schools/profile.js`](file:///e:/InsightED%20-%20ESF7%20Official/server/controllers/schools/profile.js) (`PUT /api/schools/curricular-config`)
* **Database Relational Store:** `esf7_school_profile` (31 discrete normalized columns) & `esf7_school_node_status.node_01_school` (JSONB milestone snapshot).

---

### 2. Pre-Filled Master DepEd Identifiers
In accordance with DepEd Information and Communications Technology Service (ICTS) protocol, school baseline identification data is **authoritative and pre-seeded** from the national registry (`schools_iern` / historical `esf7_database`):

1. **DepEd School ID (`school_id`)**:
   - Master 6-digit integer string (e.g. `108348`).
   - Serves as the tenant key and immutable foreign key across all downstream tables (`esf7_personnel_profile`, `esf7_class_sections`, `esf7_workload_rows`).
2. **Integrated / Entity Reference Number (`iern`)**:
   - Division-assigned entity reference code.
3. **School Name (`school_name`)**:
   - Official DepEd registered name. Pre-filled from plantilla; locked against unauthorized tampering.
4. **Geographical Administrative Division**:
   - **Region** (e.g., `Region VII - Central Visayas`, `Region IV-A - CALABARZON`).
   - **Schools Division Office (SDO)** (e.g., `Cebu Province`, `Naga City`, `Pasig City`).
   - **District** (e.g., `District 1`).

---

### 3. Modified Curricular Offering (MCOC) & Grade-Level Bounding Rules
DepEd categorizes schools by their authorized curricular offerings. The system enforces strict boundary checking:

| Offering Category | Identifier Code | DepEd Curricular Scope | Allowed Grade Levels |
| :--- | :--- | :--- | :--- |
| **Purely Elementary** | `Purely ES` / `Elementary` | Primary Basic Education | `Kinder`, `Grade 1`, `Grade 2`, `Grade 3`, `Grade 4`, `Grade 5`, `Grade 6` |
| **Purely Junior High School** | `Purely JHS` / `JHS` | Lower Secondary Education | `Grade 7`, `Grade 8`, `Grade 9`, `Grade 10` |
| **Purely Senior High School** | `Purely SHS` / `SHS` | Upper Secondary Education | `Grade 11`, `Grade 12` |
| **Elementary and Junior High** | `ES and JHS` | Integrated School (K to 10) | `Kinder` through `Grade 10` |
| **Junior High with Senior High** | `JHS with SHS` | Secondary School (7 to 12) | `Grade 7` through `Grade 12` |
| **Comprehensive K to 12** | `All Offering` | Full Integrated Complex | `Kinder` through `Grade 12` |

#### DepEd Business Logic Enforcements:
* **Dynamic Grade Level Derivation (`offeredGradeLevels`)**:
  - The application dynamically computes `offeredGradeLevels = [...]` by evaluating active curricular offerings.
  - **Downstream Hard Lock:** Downstream modules (Node 04 Organized Classes, Node 06 Workload Timetables) strictly reject creating class sections or timetabling teaching loads for grade levels outside the school's authorized MCOC.
* **Secondary School Multigrade Prohibition**:
  - DepEd prohibits Multigrade classes in secondary education. If `hasElementary` is false, `MULTIGRADE` is disabled/hidden from class creation dropdowns.

---

### 4. DepEd Special Curricular Programs (SCP)
Schools authorized by their Regional Office / Central Office declare their specialized curricula:

#### A. Elementary Special Programs:
* **Special Science Elementary School (`SSES`)**: Exclusive to Elementary offerings (`isElemActive === true`).

#### B. Junior High School Special Programs (DO No. 46, s. 2012 / DM No. 17, s. 2024):
Exclusive to schools with active JHS offerings (`isJHSActive === true`):
1. **`SPA`**: Special Program in the Arts
2. **`SPFL`**: Special Program in Foreign Language
3. **`SPJ`**: Special Program in Journalism
4. **`SPS`**: Special Program in Sports
5. **`STE`**: Science, Technology, and Engineering Program
6. **`SPTVE`**: Special Program in Technical-Vocational Education
7. **`SCIENCE`**: Special Program in Science

---

### 5. DepEd Inclusive Education Policy Framework (DO No. 44, s. 2021)
The system captures granular, stage-isolated inclusive offerings across 4 core modalities:
1. **Special Needs Education (`SNED`)**: `SNED-ES`, `SNED-JHS`, `SNED-SHS`.
2. **Alternative Learning System (`ALS`)**: `ALS-ES`, `ALS-JHS`.
3. **Indigenous Peoples Education (`IPED`)**: `IPED-ES`, `IPED-JHS`, `IPED-SHS`.
4. **Madrasah Education / ALIVE (`MADRASAH`)**: `MADRASAH-ES`, `MADRASAH-JHS`, `MADRASAH-SHS`.

Persisted as 11 granular boolean database columns (`has_es_sned`, etc.) and summary rollups (`has_sned`, `has_als`, `has_iped`, `has_madrasah`) that unlock dedicated class cards in Node 04.

---

### 6. DepEd Mandatory School Shift Scheduling Policy (DO 053, s. 2022 / DO 003, s. 2024)
1. **Mandatory Declaration (`hasShifts: true`)**: School shift scheduling is non-optional.
2. **Instructional Day Time Window**: Hours must strictly fall between **4:00 AM (04:00)** and **10:00 PM (22:00)** with `shiftEndTime > shiftStartTime`.
3. **Grade-by-Grade Shift Assignment (`shiftsConfig`)**: Every offered grade level must have an assigned shift modality (`Single Shift`, `Double Shift`, `Triple Shift`).
4. **Hard Completion Gate**: In [`AppContext.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/context/AppContext.jsx), `completeNode("school")` is strictly blocked if any offered grade level lacks an assigned shift.

---

## 👥 NODE 02: Personnel Roster & Staffing Registry

### 1. Architectural Scope & File Mapping
* **Primary Frontend Screen:** [`client/src/pages/Roster.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Roster.jsx)
* **School Head Resolvers:** [`shared/schoolHead.js`](file:///e:/InsightED%20-%20ESF7%20Official/shared/schoolHead.js)
* **Email Validation Engine:** [`client/src/context/AppContext.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/context/AppContext.jsx) (`validateDepEdEmail`)
* **Room QR Generator Portal:** [`client/src/pages/RoomQR.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/RoomQR.jsx)
* **Database Relational Store:** `esf7_personnel_profile`, `esf7_school_node_status.node_02_roster`.

---

### 2. Personnel Identification & Duplicate Checking
1. **Taxpayer Identification Number (TIN)**:
   - Primary national identifier required for all regular government appointees.
   - Format: Standard 9-digit or 12-digit format (`000-000-000-000`).
   - **"No TIN" Checkbox**: For newly hired or non-national contractual personnel without an issued TIN, checking "No TIN" auto-generates a temporary system identifier (`NO-TIN-<timestamp>`).
2. **National Cross-School Duplicate Prevention**:
   - The system performs real-time duplicate checking on **TIN**, **DepEd Email**, and **PhilSys National ID** to prevent the same individual from being fraudulently enrolled in multiple plantilla items across different schools.

---

### 3. DepEd School Head Accountability Rules
Every basic education institution in DepEd is governed by exactly **one (1)** accountable head of office:
1. **Rule 1 (Single School Head Constraint)**: Only one (1) personnel may be designated as the official School Head per school.
2. **Rule 2 (Mutual Exclusivity of Roles)**:
   - If a school designates a **Teacher-in-Charge (TIC)**, it cannot simultaneously designate a Principal or Officer-in-Charge (OIC).
   - Flagging both a TIC and a Principal triggers a high-priority warning (`school-head-tic-conflict`).
3. **Rule 3 (Multiple Principals Disambiguation)**:
   - Large or integrated schools may have multiple staff holding the plantilla title of "Principal" (e.g. JHS Principal, SHS Assistant/Associate Principal).
   - The user must explicitly mark the designated School Head via the `isSchoolHead` / `isMainSchoolHead` toggle in the Roster. If multiple Principals exist with none flagged, Node 09 raises a blocking hard error (`school-head-undesignated`).
4. **Rule 4 (SDO-Assigned Head Fallback)**:
   - If the school has no plantilla principal on-site, an SDO-appointed OIC from `esf7_school_head_sdo` stands in as the legal head of record.

---

### 4. Plantilla Position Categorization (DepEd Plantilla & PAS-OD)
Personnel are categorized into three (3) distinct personnel classifications:
1. **Teaching Personnel**:
   - `TEACHER I` through `TEACHER VII` (including `TEACHER IV - SNED` through `TEACHER VII - SNED`).
   - `MASTER TEACHER I` through `MASTER TEACHER V`.
   - `SPECIAL SCIENCE TEACHER I` through `V`.
   - `LEARNER SUPPORT AIDE` (LSA) and `ALIVE TEACHER`.
2. **Teaching-Related Personnel**:
   - `SCHOOL PRINCIPAL I` through `IV`, `SPECIAL SCHOOL PRINCIPAL I` & `II`.
   - `HEAD TEACHER I` through `VI` (including TIC and Guidance Designate variants).
   - `ASSISTANT SCHOOL PRINCIPAL I` through `III`.
   - `GUIDANCE COUNSELOR I` through `III`, `GUIDANCE COORDINATOR I` through `III`.
   - `SCHOOL LIBRARIAN`, `VOCATIONAL SCHOOL ADMINISTRATOR`.
3. **Non-Teaching Personnel**:
   - `ADMINISTRATIVE OFFICER I (AO I)` through `AO V`.
   - `ADMINISTRATIVE ASSISTANT I (ADAS I)` through `ADAS VI`.
   - `ADMINISTRATIVE AIDE I (ADA I)` through `ADA VI`.
   - Health and Nutrition Staff: `NURSE`, `MEDICAL OFFICER`, `DENTIST`, `NUTRITIONIST-DIETITIAN`.
   - Utility and Security: `SECURITY GUARD`, `UTILITY WORKER`, `DRIVER`.
   - **`COOK` Special Rule**: Position automatically forces:
     - Category: `NON-TEACHING`
     - Nature of Appointment: `CONTRACTUAL`
     - Fund Source: `SBFP` (School-Based Feeding Program). `SBFP` is strictly hidden from all other positions.

---

### 5. DepEd Official Google Workspace Email (`@deped.gov.ph`) Rules
1. **Domain Validation**: Must strictly end with `@deped.gov.ph` and contain valid RFC 5322 characters.
2. **Mandatory Scope**: Required for all **Regular Permanent** teaching, teaching-related, and nationally-funded non-teaching personnel.
3. **Married Personnel & Maiden Surname Policy**:
   - DepEd Google Workspace accounts retain the maiden surname (stored as Middle Name on eSF7) when female personnel marry.
   - The validation engine (`validateDepEdEmail`) allows the local email part to match either the `lastName` or the `middleName` (maiden surname).
4. **Legal Name Discrepancy Override (`allowEmailDiscrepancy`)**:
   - If a PSA birth certificate correction causes a name mismatch with an older issued Google Workspace account, toggling the override and typing `"CONFIRM"` permits the email while maintaining domain validity.
5. **Pending ITO Issuance (`no_deped_email: true`)**:
   - Staff awaiting SDO Information Technology Officer (ITO) batch issuance may select `"No DepEd email issued / Pending ITO Issuance (N/A)"`, recording `deped_email = 'N/A'` and `no_deped_email = true`.

---

### 6. Nature of Appointment & Funding Sources
* **Nature of Appointment**:
  - `REGULAR PERMANENT` (DepEd National Plantilla Item).
  - `PROVISIONAL` (DepEd provisional appointments under RA 10533 for specialized SHS tracks).
  - `SUBSTITUTE` (Covering personnel on maternity, sick, or study leave).
  - `CONTRACTUAL` (Contract of Service / Job Order).
* **Funding Sources**:
  - `NATIONAL` (General Appropriations Act / DepEd National Budget).
  - `LOCAL GOVERNMENT UNIT (LGU)` (Special Education Fund / SEF).
  - `PTCA / PTA` (Parent-Teacher Association funded).
  - `SBFP` (School-Based Feeding Program — exclusive to `COOK`).

---

### 7. Inter-School Reassignment & Deployment Matrix
* **`OWN STATION`**: Personnel stationed and teaching at their plantilla mother school.
* **`REASSIGNED` / `BORROWED`**:
  - **Mother School:** Holds the official permanent appointment; assigns **0 teaching load (0 minutes)**. Certified complete with 0 workload rows.
  - **Host / Receiving School:** Holds the full profile and **100% of the teaching workload**.
* **`CLUSTERED`**:
  - Personnel teaching in two schools concurrently. Both schools allocate timetable slots within the 360-minute daily ceiling.

---

## 🎓 NODE 03: Personnel Profiling & Qualifications

### 1. Architectural Scope & File Mapping
* **Primary Frontend Screen:** [`client/src/pages/PersonnelProfile.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/PersonnelProfile.jsx)
* **Mobile 3-Factor Portal:** [`client/src/pages/RoomProfiling.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/RoomProfiling.jsx)
* **Backend Endpoint:** [`server/controllers/personnel.js`](file:///e:/InsightED%20-%20ESF7%20Official/server/controllers/personnel.js) (`PUT /api/personnel/:id`)
* **Database Relational Store:** `esf7_personnel_profile`, `esf7_personnel_employment`, `esf7_personnel_node_status.node_04_profile`.

---

### 2. Educational Attainment & Degree Dependencies
1. **Baccalaureate / College Degree**:
   - **Mandatory for all Teaching & Teaching-Related personnel**.
   - If the degree is in Education (e.g. *Bachelor of Secondary Education - BSED*, *Bachelor of Elementary Education - BEED*), the **Major** is mandatory.
   - **Non-Education Graduates:** Must declare a Major in Education units (18 professional education units) to qualify for teaching appointments.
   - Non-teaching personnel are exempt unless their highest attainment is College Graduate or Post-Graduate.
2. **Post-Graduate Degrees (Masteral & Doctoral)**:
   - Options: `MASTER'S DEGREE (GRADUATED)`, `MASTER'S DEGREE (WITH UNITS)`, `DOCTORATE DEGREE (GRADUATED)`, `DOCTORATE DEGREE (WITH UNITS)`.
   - Multi-discipline tagging: Supports multiple post-graduate areas of study.

---

### 3. Civil Service & Professional Eligibility (RA 7836 / RA 9293)
1. **Teaching Staff Licensure Mandate**:
   - All personnel in `TEACHING` positions must possess either:
     - **LET** (Licensure Examination for Teachers) or
     - **PBET** (Professional Board Examination for Teachers).
   - Failure to hold LET/PBET triggers a blocking hard error (`teaching-let-req`).
2. **Related-Teaching Positions**:
   - Positions requiring prior teaching service (Principals, Assistant Principals, Head Teachers) must hold LET or PBET.
3. **PRC Specialization Requirement**:
   - When Eligibility is LET or PBET, **PRC Specialization** (e.g. *General Education*, *Mathematics*, *Biological Science*, *English*) is mandatory.

---

### 4. Plantilla Salary Grade & Step Increment Matrix
* **DepEd Salary Matrix**: Standardized in accordance with the DBM Salary Standardization Law (SSL).
* **Automatic SG Mapping**: Selecting a position automatically maps the approved Salary Grade (e.g., `TEACHER I` $\rightarrow$ SG 11, `TEACHER II` $\rightarrow$ SG 12, `TEACHER III` $\rightarrow$ SG 13, `MASTER TEACHER I` $\rightarrow$ SG 18, `PRINCIPAL I` $\rightarrow$ SG 19).
* **Step Increment (Steps 1 to 8)**:
  - Step 1 is the entry baseline.
  - Advancements occur based on longevity (1 step per 3 years of continuous satisfactory service) or merit.

---

### 5. Learning Area Specialization Matrix (Service Longevity Allocation)
* Every teaching personnel must fully account for their accumulated teaching longevity across learning areas.
* Total required years:
  $$\text{Required Years} = \min(70, \max(1, \text{Current Year} - \text{First Service Year}))$$
* The sum of assigned years across learning areas in `learningAreaMap` must **exactly equal** the total required years (`la-incomplete` error if under-allocated).

---

### 6. Mobile 3-Factor Room QR Authentication
To preserve privacy while enabling self-profiling from personal mobile devices in faculty rooms:
1. **Factor 1 (Dynamic TOTP Passcode)**: 8-character time-based rotating code generated by the School Head's terminal (rotates every 10 minutes).
2. **Factor 2 (Surname Verification)**: Case-insensitive normalized match against the teacher's legal last name.
3. **Factor 3 (Birth Year Verification)**: 4-digit birth year match against the roster birthdate.
4. **Security Throttling**: 3 consecutive failed attempts locks the device for 10 minutes (`room_profiling_lockout_until`). Roster names are never leaked publicly.

---

## 🏫 NODE 04: Organized Classes & Section Setup

### 1. Architectural Scope & File Mapping
* **Primary Frontend Screen:** [`client/src/pages/OrganizedClasses.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/OrganizedClasses.jsx)
* **Inter-School Requests:** [`client/src/pages/RequestCenter.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/RequestCenter.jsx)
* **Database Relational Store:** `esf7_class_sections`, `esf7_school_node_status.node_06_classes`.

---

### 2. 5-Card Layout Architecture
Section creation is structured into 5 functional cards aligned with DepEd programs:
1. **Regular Classes (Mono Grade & Multi Grade)**: Standard general education curriculum.
2. **SNED Non-Graded Classes**: Specialized classes for learners with disabilities (Transition, Life Skills). Rendered only if SNED is active in Node 01.
3. **ALS Classes**: Alternative Learning System learning groups. Rendered only if ALS is active in Node 01.
4. **ARAL Program Classes (RA 12028)**: Academic Recovery and Accessible Learning intervention cohorts.
5. **Remedial / Enrichment Classes**: Subject-specific reinforcement cohorts.

---

### 3. MCOC Dynamic Grade-Level Enforcement
* Section grade levels are strictly constrained to the school's authorized `offeredGradeLevels`.
* A junior high school cannot organize Grade 1–6 sections; an elementary school cannot organize secondary sections.

---

### 4. DepEd Multigrade Isolation Policy
* Multigrade classes (combining two or more grade levels in one classroom under one teacher) are **strictly an Elementary curriculum policy**.
* If the school lacks elementary offerings (`!hasElementary`), `MULTIGRADE` is completely stripped from dropdowns. Any attempt to submit a multigrade section on secondary offerings automatically defaults to `MONO GRADE`.

---

### 5. Enrollment Mathematics & Official Rollups
* **Learner Counts**: Each section captures $Male$ and $Female$ counts:
  $$\text{Section Total} = \text{Learners}_{\text{Male}} + \text{Learners}_{\text{Female}}$$
* **Regular Enrollment Sum**: Regular sections and SNED Non-Graded learners are summed into the **Total Regular School Enrollment**.
* **ALS Learner Isolation**: ALS learners are tracked separately and excluded from regular headcount to maintain LIS segregation.
* **1,001+ Threshold**: Total regular enrollment $\ge 1,001$ learners legally mandates the appointment of an Assistant School Head Designate in Node 05.

---

### 6. Class Adviser Qualification Rules
1. **Grade-Level Qualification Filtering**: The adviser dropdown lists only teaching personnel qualified for that section's grade level.
2. **ALS / SNED Adviser Filtering**: Only teachers with `ALS` or `SNED (NON-GRADED)` in their profile may advise ALS/SNED sections.
3. **Automatic Timetable Injection**: Assigning an adviser automatically injects into the teacher's schedule:
   - **Class Advising duties** (Ancillary credit)
   - **Homeroom Guidance Program (HGP)** (Instructional load)

---

## 🎖️ NODE 05: Designations & Ancillary Duties

### 1. Architectural Scope & File Mapping
* **Primary Frontend Screen:** [`client/src/pages/Designations.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Designations.jsx)
* **School Level Helpers:** [`shared/schoolLevel.js`](file:///e:/InsightED%20-%20ESF7%20Official/shared/schoolLevel.js)
* **Database Relational Store:** `esf7_personnel_designations`, `esf7_personnel_node_status.node_07_designation`.

---

### 2. DepEd Key Stage Organization (MATATAG Framework)
Department Heads and Chairpersons are structured across the 4 DepEd Key Stages:
1. **Key Stage 1 (KS1 - Kinder to Grade 3)**:
   - Department Head / Grade Chairperson over early childhood and primary literacy/numeracy.
2. **Key Stage 2 (KS2 - Grades 4 to 6)**:
   - Organized across the 8 primary learning areas: *English*, *Filipino*, *Mathematics*, *Science*, *Araling Panlipunan*, *EPP/TLE*, *MAPEH*, *GMRC / Values Education*.
3. **Key Stage 3 (KS3 - Grades 7 to 10)**:
   - Organized across the 8 secondary learning areas: *English*, *Filipino*, *Mathematics*, *Science*, *Araling Panlipunan*, *TLE/TVL*, *MAPEH*, *Values Education / EsP*.
4. **Key Stage 4 (KS4 - Grades 11 to 12)**:
   - Organized across tracks: *Academic Track* and *Tech-Pro / TVL Track*.

---

### 3. Mandatory Statutory School Designations
Depending on school size, the following designations must be staffed before final eSF7 certification:
1. **Guidance Designate**: Mandated under RA 9258 / DepEd Child Protection Policy.
2. **Learner Information Officer (LIO) / LIS Coordinator**: Responsible for official Learner Information System updates.
3. **Disaster Risk Reduction and Management (DRRM) Coordinator**: Mandated under DO No. 21, s. 2015.
4. **School Feeding Coordinator**: Required if SBFP is implemented.
5. **Assistant School Head Designate (ASH)**: **Strictly mandatory** if total regular enrollment is **1,001 or more learners**.

---

### 4. Official SDS Approval Protocol (`::APPROVED_SDS`)
* Certain division-level coordinatorships require formal designation signed by the Schools Division Superintendent (SDS).
* In the database and UI, designations requiring division backing append the `::APPROVED_SDS` validation token upon verification. Internal school head designations remain unflagged.

---

## ⏰ NODE 06: Workload & Timetable Scheduling

### 1. Architectural Scope & File Mapping
* **Primary Frontend Screen:** [`client/src/pages/Workload.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Workload.jsx)
* **Conflict & Collision Detectors:** [`client/src/context/AppContext.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/context/AppContext.jsx)
* **Database Relational Store:** `esf7_workload_rows`, `esf7_shs_workload_rows`, `esf7_personnel_node_status.node_08_workload`.

---

### 2. Statutory Working Hours (RA 4670 Magna Carta & DO 005, s. 2024)
1. **Maximum Daily Teaching Contact Time**:
   - Actual classroom teaching contact time shall **not exceed 6 hours (360 minutes) per day**.
   - Any teaching time allocated beyond 360 minutes daily constitutes **Teaching Overload**.
2. **2 Hours for Ancillary / Teaching-Related Activities**:
   - The remaining 2 hours of the standard 8-hour workday are reserved for lesson planning, grading of student outputs, preparation of instructional aids, and homeroom guidance.
3. **Instructional Period Limits**:
   - Elementary and Junior High School single subject periods: **Maximum 60 minutes**.
   - Senior High School block periods: **Maximum 360 minutes** (flexible block scheduling).
   - Kindergarten: *Kinder Blocks of Time* (180 minutes / 3 hours) is exempt from the 60-minute single subject cap.
   - Administrative tasks: Exempt from classroom duration limits.

---

### 3. Schedule Collision & Conflict Prevention Rules
Before any workload save is committed, the engine verifies zero timetable collisions:
1. **Teacher Conflict Rule**: A teacher cannot be scheduled in two different sections or tasks at overlapping times on the same day.
2. **Section Conflict Rule**: A class section cannot have two different subjects scheduled at overlapping times in the same room/slot.
3. **Clustered Multi-School Collision Check**: For clustered teachers, School A and School B slots are synchronized via WebSocket/Ghost Sync; an overlapping slot in School B blocks scheduling in School A.

---

### 4. Official DepEd Administrative Task Categories
To prevent ad-hoc entries, non-teaching duties assigned to teachers are restricted to official DepEd classifications:
1. `ADMIN TASK - PERSONNEL ADMINISTRATION`
2. `ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP`
3. `ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT`
4. `ADMIN TASK - FINANCIAL MANAGEMENT`
5. `ADMIN TASK - RECORDS MANAGEMENT`
6. `ADMIN TASK - PROGRAM MANAGEMENT`

---

## 💰 NODE 07: Allowances & Financial Incentives

### 1. Architectural Scope & File Mapping
* **Primary Frontend Screen:** [`client/src/pages/Allowances.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Allowances.jsx)
* **Shared Logic:** [`shared/allowances.js`](file:///e:/InsightED%20-%20ESF7%20Official/shared/allowances.js)
* **Database Relational Store:** `esf7_personnel_allowances`, `esf7_personnel_node_status.node_09_allowances`.

---

### 2. DepEd Authorized Allowance Classifications
1. **Clothing / Uniform Allowance (`uniform`)**:
   - Annual allowance for official DepEd teaching and non-teaching uniforms (DBM Budget Circular).
2. **Cash Allowance for Teaching Supplies (`supplies`)**:
   - Authorized under **RA 11997 ("Kabalikat sa Pagtuturo Act")**.
   - **Eligibility Gate:** Restricted **strictly to Teaching Personnel**. Teaching-related and non-teaching staff are legally excluded.
3. **Medical Allowance (`medical`)**:
   - Fixed annual medical and health examination subsidy (₱7,000 per employee).
4. **Special Hardship Allowance (`hardship` / SHA)**:
   - Governed by **DepEd Order No. 039, s. 2021**.
   - Granted to teachers assigned to hardship posts: pure multigrade schools, remote schools with hazardous transport difficulty, or isolated mobile teacher deployments.
5. **Personnel Economic Relief Allowance (`pera`)**:
   - Standard ₱2,000 monthly subsidy.

---

### 3. Individual Allowance Disabling Protocol
* Personnel who waive or are disqualified from specific allowances (e.g. SHA in non-hardship stations) have the allowance item recorded in the `disabled` array (`isAllowanceDisabled(personAllowances, key)`).
* Disabled allowances are excluded from compliance checklists and financial rollup totals without requiring personnel deletion.

---

## 📈 NODE 08: Teaching Overload Center

### 1. Architectural Scope & File Mapping
* **Primary Frontend Screen:** [`client/src/pages/Overload.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Overload.jsx)
* **Master Skill Spec:** [`esf7_agents/overload-architect/SKILL.md`](file:///e:/InsightED%20-%20ESF7%20Official/.agents/skills/overload-architect/SKILL.md)
* **Database Relational Store:** `esf7_overload_records`, `esf7_school_node_status.node_10_overload`.

---

### 2. Legal Authority & Eligibility (RA 4670 & DO 005, s. 2024)
* **Section 13, Republic Act No. 4670 (Magna Carta for Public School Teachers)**:
  > *"Any teacher who renders actual classroom teaching in excess of six hours a day shall be given additional compensation equivalent to their regular rate plus at least twenty-five percent (25%) thereof."*
* **Exclusivity**: Only personnel in **active teaching positions** are eligible. Teaching-related (Principals, Head Teachers) and non-teaching personnel are strictly excluded from earning overload pay.

---

### 3. DepEd Per Hour Teaching Rate (PHTR) Formula
The hourly overload rate is determined dynamically from the teacher's exact Salary Grade and Step Increment:

$$\text{PHTR (₱/hour)} = 0.000781 \times 12 \times \text{Monthly Basic Salary}$$

*Derived from the standard DepEd budgetary coefficient:*
$$\text{Hourly Rate} = \frac{\text{Annual Salary}}{2,080 \text{ hours}} \times 1.25 \text{ (25\% Magna Carta premium)} = \frac{\text{Monthly Salary} \times 12}{260 \times 8} \times 1.25$$

---

### 4. 3-Term School Calendar & End-of-Term Exclusion Policy
No overload compensation is earned during examination, clearance, or vacation periods. Instructional blocks vs excluded periods for SY 2026–2027:

| Period | Block Name | Date Range | Overload Eligibility |
| :--- | :--- | :--- | :---: |
| **Term 1** | Instructional Block | **June 8 – September 1, 2026** | **ACTIVE OVERLOAD** |
| | End-of-Term Block | **September 2 – September 15, 2026** | ❌ **EXCLUDED (0h)** |
| **Term 2** | Instructional Block | **September 16 – December 4, 2026** | **ACTIVE OVERLOAD** |
| | End-of-Term Block | **December 7 – December 18, 2026** | ❌ **EXCLUDED (0h)** |
| | Holiday Break | **December 19, 2026 – January 3, 2027** | ❌ **EXCLUDED (0h)** |
| **Term 3** | Instructional Block | **January 4 – March 23, 2027** | **ACTIVE OVERLOAD** |
| | End-of-Term Block | **March 24 – April 8, 2027** | ❌ **EXCLUDED (0h)** |
| **Vacation** | Summer / Vacation Break | **April 9 – June 6, 2027** | ❌ **EXCLUDED (0h)** |

---

### 5. Fiscal Year (FY) Quarterly Reporting
For budget allotment, liquidation claims, and payroll submission:
* **FY Q1 (Jan–Mar)**: Term 3 Instructional Block (Jan 4 – Mar 23).
* **FY Q2 (Apr–Jun)**: Term 1 Instructional Block (June 8 – June 30).
* **FY Q3 (Jul–Sep)**: Term 1 (July 1 – Sept 1) + Term 2 (Sept 16 – Sept 30).
* **FY Q4 (Oct–Dec)**: Term 2 Instructional Block (Oct 1 – Dec 4).

---

## 🛡️ NODE 09: Validation Center, Certification & Submission

### 1. Architectural Scope & File Mapping
* **Primary Frontend Screen:** [`client/src/pages/ValidationCenter.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/ValidationCenter.jsx)
* **Final Submission Screen:** [`client/src/pages/Submission.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Submission.jsx)
* **Validation Engine:** [`client/src/context/AppContext.jsx`](file:///e:/InsightED%20-%20ESF7%20Official/client/src/context/AppContext.jsx) (`getValidationIssues`)
* **Database Relational Store:** `esf7_validation`, `esf7_school_node_status.node_11_validation`.

---

### 2. Multi-Tier Error Classification (Hard Errors vs Soft Warnings)

#### A. Hard Errors (Red Blocking — Prevents eSF7 Submission):
1. **Missing Shift Schedule**: Any offered grade level without an assigned shift in Node 01.
2. **Duplicate Identifiers**: Duplicate TIN, duplicate DepEd Email, or duplicate PhilSys across roster records.
3. **Undesignated School Head**: Multiple Principals in the roster without exactly one flagged as the official head of office.
4. **Unlicensed Regular Teachers**: Regular Permanent teaching staff without LET or PBET eligibility.
5. **Missing PRC Specialization**: Teaching staff holding LET/PBET without a declared PRC specialization.
6. **Missing Baccalaureate / College Degree**: Teaching staff without a recorded college degree.
7. **Schedule Collisions**: Any teacher or section scheduled in overlapping slots on the same day.
8. **Excessive Subject Duration**: Non-SHS single subject periods exceeding 60 minutes.
9. **Zero Teaching Load on Own Station**: Teaching personnel tagged as `OWN STATION` with 0 teaching minutes.
10. **Zero Allowances Checked**: Complete absence of any active allowance selection in Node 07.

#### B. Soft Warnings (Amber Non-Blocking — Advisory Flags):
1. Questionable employee age ($< 18$ or $> 80$ years old).
2. Clustered or borrowed personnel pending SDO/School acceptance handshake.
3. Non-nationally funded non-teaching personnel without an issued DepEd email.
4. Unallocated learning area longevity years.
5. Edited prefilled school information awaiting SDO Planning Officer acknowledgement.

---

### 3. SDO Division Review Workflow & Status Lifecycle
* **`IN_PROGRESS`**: Local draft actively edited by the School Head.
* **`SUBMITTED` / `PENDING_REVIEW`**: Transmitted to the Schools Division Office (SDO) submission queue for inspection by the Division Planning Officer and Division Accountant.
* **`APPROVED`**: Formally certified by the SDO; archived into official production records.
* **`REVISION_REQUIRED`**: Returned to the school with reviewer comments; unlocks drafts for corrections and re-submission (`resubmitSchoolValidation`).

---

### 4. School Head Digital Certification Oath & Archival Lock
1. **Formal Legal Declaration**:
   > *"I hereby certify under oath that this Electronic School Form 7 (eSF7) contains a complete, accurate, and true record of personnel assignments, educational qualifications, class schedules, and compensation incentives of this school pursuant to DepEd orders and existing laws."*
2. **Digital Signature / Canvas Verification**: School Head attaches or draws an official signature.
3. **System Archival Lock**:
   - Committing final submission triggers a transactional worker that deletes transient drafts, transitions `overall_status = 'COMPLETED'`, locks all 9 nodes into **read-only mode**, and generates official `.xlsb` / `.xlsx` spreadsheet and PDF packages for DepEd Division and Central Office archiving.

---

*(End of Manual — InsightED ESF7 Official Specification)*
