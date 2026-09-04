# ESF7 Personnel Roster Technical Blueprint & Flow Specifications

This document serves as the authoritative blueprint for [Roster.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Roster.jsx) and [PersonnelProfile.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/PersonnelProfile.jsx).

---

## 1. Component Architecture & State Dependencies

### Context Dependencies (`useApp()`)
* **`personnel`** (`Array<Object>`): Global list of personnel. Each record contains attributes:
  * `id` (`String`/`Number`)
  * `salutation` (`'MR.'` | `'MRS.'` | `'MS.'`)
  * `firstName`, `middleName`, `lastName`, `nameExtension`
  * `depedEmail` (`String`)
  * `type` (`'teaching'` | `'teaching-related'` | `'non-teaching'`)
  * `position` (`String`)
  * `isSchoolHead` (`Boolean`)
  * `isDraft` (`Boolean`)
  * `isShared` (`Boolean`)
* **`addPersonnel(personData)`** (`Async Function`): Creates a new personnel record and returns the new `id`.
* **`deletePersonnel(id)`** (`Function`): Removes personnel by ID.
* **`toggleSchoolHead(id, isHead)`** (`Async Function`): Designates or removes School Head status for a personnel member.
* **`commitDraftPersonnel(id?)`** (`Async Function`): Commits auto-filled draft records to permanent storage.
* **`setActivePersonnelId(id)`** (`Function`): Sets active target personnel ID for profile/workload views.
* **`setActiveView(viewName)`** (`Function`): Swaps active layout (`'roster'`, `'profile'`, `'workload'`).
* **`showConfirm(title, message)`** (`Async Function`): Displays confirmation modal (returns `Boolean`).
* **`showToast(message)`** (`Function`): Triggers toast notification.
* **`hasUnsavedChanges`** (`Boolean`): Global dirty state flag.

---

## 2. Business Logic & Validation Specifications

### A. Single School Head Restriction Rule
* **Rule**: Each school can have at most **ONE** School Head (Principal, Teacher-in-Charge / TIC, Officer-in-Charge / OIC).
* **Validation**:
  1. **Non-Teaching Exclusion**: Non-teaching personnel (`type === 'non-teaching'`) CANNOT be designated as School Head. The toggle switch is disabled (`opacity: 0.4`, `cursor: not-allowed`).
  2. **Conflict Checking on Add**: When submitting Add Personnel modal with a principal/TIC/OIC position, checks if another School Head already exists. Alerts user if a conflict exists and halts submission.
  3. **Replacement Confirmation on Toggle**: Toggling `isSchoolHead = true` on a teacher when another head exists prompts a confirmation dialog (`showConfirm`) to replace the existing head.

### B. Draft Auto-Fill Commitment System
* **Behavior**:
  * Records auto-filled from master database are flagged as `isDraft: true`.
  * Roster view displays a warning banner when `drafts.length > 0`.
  * Provides a global **"Save Changes"** button (`commitDraftPersonnel()`) as well as individual row-level **"Save"** buttons for draft records.

### C. DepEd Email Format Policy
* **Pattern**: `<username>@deped.gov.ph`
* **Sanitization**: Converts local username to lowercase and strips non-alphanumeric/dot characters (`/[^a-z0-9.]/g`).
* **Info Modal**: Clicking `i` badge opens `<DepEdEmailInfoModal />`.

### D. Category & Position Option Mapping
* **Categories**:
  * `'teaching'`: Teaching positions (Teacher I-III, Master Teacher I-IV, Head Teacher I-VI, etc.)
  * `'teaching-related'`: Principal, Assistant Principal, Education Program Supervisor, School District Supervisor, Guidance Counselor, etc.
  * `'non-teaching'`: Administrative Officer, Accountant, Nurse, Registrar, Utility, `'OTHERS'`.
* **Custom Specified Positions**:
  * When `position === 'OTHERS'`, non-teaching users can type a custom title (up to 50 chars), stored formatted as `'OTHERS - <TITLE>'`.

---

## 3. UI Flow & Navigation Map

```
+-----------------------------------------------------------------------------------+
| ROSTER CARD HEADER                                                                |
|  Title: Personnel Roster                                                          |
|  [+ Add personnel] -> opens Add Personnel Modal                                   |
+-----------------------------------------------------------------------------------+
| UNSAVED AUTO-FILL DRAFT BANNER (Conditional: drafts.length > 0)                   |
|  "Unsaved Auto-Fill Records Detected"                                             |
|  [Save Changes] -> commitDraftPersonnel()                                         |
+-----------------------------------------------------------------------------------+
| TABS & SEARCH ROW                                                                 |
|  Tabs: [All] [Teaching] [Related] [Non-Teaching]                                 |
|  Search: Name, DepEd Email, Category, Position                                    |
+-----------------------------------------------------------------------------------+
| PERSONNEL TABLE                                                                   |
|  Columns: Desig | First Name | Middle | Last | DepEd Email | Category | Position | |
|           School Head (Toggle) | Actions ([Profile], [Work], [Save], [✕])        |
|                                                                                   |
|  [Profile] -> setActivePersonnelId(id) + setActiveView('profile')                 |
|  [Work]    -> setActivePersonnelId(id) + setActiveView('workload')                |
|  [Save]    -> commitDraftPersonnel(id)                                            |
|  [✕]       -> showConfirm() -> deletePersonnel(id)                                |
+-----------------------------------------------------------------------------------+
| MODALS                                                                            |
|  <DepEdEmailInfoModal isOpen={isEmailInfoOpen} onClose={...} />                   |
|  Add Personnel Modal                                                             |
+-----------------------------------------------------------------------------------+
```

---

## 4. Versioned Flow History Log

* **Version 1.0 (2026-08-12)**: Initial master flow blueprint established.
  * Baseline features: Roster table, Category tabs, Search & Sort, School Head single-principal enforcement, Draft commitment banner, DepEd Email policy modal, Add Personnel modal with searchable position dropdown.
* **Version 1.1 (2026-09-03)**: Modal layout enhancement & email restriction sync.
  * Removed redundant `DESIGNATION` (MR./MRS./MS.) dropdown from Add Personnel modal.
  * Expanded `DepEd Email` container to span 2 grid columns for easier input.
  * Placed `Position Category` and `Position` side-by-side in a responsive 2-column sub-grid (`1fr 1fr`).
  * Enforced real-time `validateDepEdEmail` restriction in Add Personnel modal (prevents typing `@`, highlights invalid domains or mismatching first/last names in red, displays inline error prompt, and restricts modal submission).
