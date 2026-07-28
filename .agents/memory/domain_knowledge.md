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