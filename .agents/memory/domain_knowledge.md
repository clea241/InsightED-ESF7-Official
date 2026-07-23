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