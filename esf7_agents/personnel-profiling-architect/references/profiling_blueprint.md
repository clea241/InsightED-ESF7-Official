# ESF7 Personnel Profiling Technical Blueprint & Flow Specifications

This document serves as the authoritative blueprint for [PersonnelProfile.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/PersonnelProfile.jsx).

---

## 1. Component Architecture & State Dependencies

### Context Dependencies (`useApp()`)
* **`personnel`** (`Array<Object>`): List of school personnel records.
* **`activePersonnelId`** (`String`/`Number`): ID of the currently selected personnel profile.
* **`setActivePersonnelId(id)`** (`Function`): Updates active personnel selection.
* **`updatePersonnelInfo(id, updatedFields)`** (`Function`): Updates state in AppContext.
* **`savePersonnelChanges(id, data)`** (`Async Function`): Saves personnel profile changes to the server database.
* **`showToast(msg, type)`** (`Function`): Toast notification handler.
* **`showAlert(title, msg)`** (`Async Function`): Alert modal trigger.
* **`showConfirm(title, msg)`** (`Async Function`): Confirmation modal trigger.
* **`hasUnsavedChanges`** (`Boolean`): Global dirty state flag.

### Local Component State & Real-Time Draft Persistence
* **`dbPerson`**: Personnel object found in database state (`personnel.find(p => p.id === activePersonnelId)`).
* **`editPerson`**: Mutable draft personnel object. On component mount or selection change, loads from `localStorage.getItem('draft_personnel_' + dbPerson.id)` if present, otherwise defaults to `dbPerson`.
* **`currentPerson`**: Computed active record (`editPerson || dbPerson`).
* **`learningAreaMap`**: Learning area taught matrix state (`key: '${eraKey}||${subjectKey}'` ➔ `{ checked: boolean, years: number }`). Automatically synchronized with `api.getLearningAreas(id)` and cached to `localStorage.getItem('draft_learning_areas_' + id)`.

---

## 2. Business Logic & Calculation Specifications

### A. Learning Area Taught Matrix & Curriculum Eras
* **Curriculum Eras (`CURRICULUM_ERAS`)**:
  * `'1973-2002'`: 1973–2002 (NSEC / NEP)
  * `'2002-2011'`: 2002–2011 (2002 Basic Education Curriculum)
  * `'2011-2023'`: 2011–2023 (K to 12 Basic Education Program)
  * `'2023-Present'`: 2023–Present (MATATAG Curriculum)
* **Primary Subjects (`PRIMARY_SUBJECTS`)**:
  * `'Filipino'`, `'English'`, `'Mathematics'`, `'Science'`, `'Araling Panlipunan (AP)'`, `'Edukasyon sa Pagpapakatao (EsP)'`, `'Technology and Livelihood Education (TLE)'`, `'MAPEH'`.

### B. Service Years Capping Math
* **`getMaxAllowedServiceYears(person)`**:
  * Evaluates `person.firstServiceDate` year relative to current year (`currentYear - startYear`).
  * Clamped to `Math.min(70, Math.max(1, years))`. Default fallback: `70`.
* **`getCellMaxYears(eraKey, subjectKey, person, currentMap)`**:
  * Calculates maximum allowed years for a specific subject within a curriculum era block based on start/end era boundaries and remaining service years across other eras.
* **Cell Toggles (`handleToggleLearningAreaCell`)**:
  * Saves updates to server via `api.saveLearningArea()` and updates local draft `draft_learning_areas_${personnelId}`.

### C. Educational Background & Civil Service Eligibility
* **Degree Options**:
  * `COLLEGE_DEGREE_OPTIONS` (Bachelor of Elementary Education, Bachelor of Secondary Education, etc.)
  * `POST_GRADUATE_DEGREE_OPTIONS` (Master of Arts in Education, Doctor of Education, etc.)
* **Specializations & Majors**: `MAJOR_OPTIONS`, `MINOR_OPTIONS`, `DISCIPLINE_OPTIONS`, `PRC_SPECIALIZATION_OPTIONS`.
* **Eligibility Options**:
  * Standard options: LET, PBET, Civil Service Professional/Sub-Professional.
  * Custom RA 1080 Board Exam modal (`showRa1080Modal`): Allows typing specific board exam title (e.g. `'RA 1080 (REGISTERED SOCIAL WORKER)'`).

---

## 3. UI Section Map & Navigation Structure

```
+-----------------------------------------------------------------------------------+
| PROFILE HEADER BANNER                                                             |
|  Name: {salutation} {firstName} {middleName} {lastName} {nameExtension}          |
|  Position: {position} | DepEd Email: {depedEmail} | DepEd Item: {itemNo}         |
|  [Save Profile Changes] -> savePersonnelChanges()                                |
+-----------------------------------------------------------------------------------+
| PROFILE NAVIGATION TABS                                                           |
|  [Identity & Personal] [Plantilla & HR] [Education & Eligibility]                |
|  [Learning Area Matrix] [Seminars & NEAP] [Service Records]                       |
+-----------------------------------------------------------------------------------+
| SECTION 1: IDENTITY & PERSONAL INFORMATION                                        |
|  Sex at Birth, Civil Status, Birthdate, Contact Number, Address, LRN, TIN, GSIS  |
+-----------------------------------------------------------------------------------+
| SECTION 2: PLANTILLA & HR DETAILS                                                 |
|  Position Category, Position Title, Appointment Status, Hiring Arrangement,       |
|  Fund Source, School Head Designation Switch, Shared Personnel Status             |
+-----------------------------------------------------------------------------------+
| SECTION 3: EDUCATIONAL BACKGROUND & ELIGIBILITY                                   |
|  College Degree, Major/Minor, Post-Graduate, Civil Service Eligibility,            |
|  RA 1080 Board Exam Modal, TESDA Certifications                                   |
+-----------------------------------------------------------------------------------+
| SECTION 4: LEARNING AREA TAUGHT MATRIX (FEATURE A)                                |
|  Grid of Curriculum Eras vs Primary Subjects                                      |
|  Cell Checkboxes + Years Taught Input (Validated against Service Years Cap)       |
+-----------------------------------------------------------------------------------+
| MODALS & OVERLAYS                                                                 |
|  RA 1080 Board Exam Input Modal (`showRa1080Modal`)                              |
|  <DepEdEmailInfoModal isOpen={isEmailInfoOpen} onClose={...} />                   |
+-----------------------------------------------------------------------------------+
```

---

## 4. Versioned Flow History Log

* **Version 1.0 (2026-08-13)**: Initial master flow blueprint established.
  * Baseline features: Full Personnel Profiling form tabs, Learning Area Taught Matrix with era capping math, RA 1080 modal input, local draft real-time auto-saving (`draft_personnel_${id}`), and DepEd Email policy modal.
