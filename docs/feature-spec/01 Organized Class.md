# Feature: Organized Classes & Section Setup

## Purpose
Give the school head a single organized place to register and manage
class sections (Regular, ARAL, Remedial/Enrichment) and the active
subject catalog within the eSF7 app for the current school year.

## Primary User & Entry Point
The school head, via the "Class Sections" node in the eSF7 setup flow
(`client/src/pages/OrganizedClasses.jsx`), reached from the Dashboard
node map and continuing on to Workload.

## Workspace Structure
There is no tab-based switcher anymore — the page is a single scrolling
view made of independent cards:

1. **Organized Classes Setup — Summary card**: just the Total Enrolled
   (M/F split) stats. This card carries a single button in its
   upper-right corner, "Curriculum & Subjects Taught," which is now the
   *only* access point to the subject catalog — it opens it as a modal
   (see "Subjects Taught Workspace" below). There is no longer a
   "Class Sections & Advisers" tab button either; the sections cards
   below are simply always on the page.
2. **Class Sections & Advisers card** — its own card, containing only
   the Regular Sections table and its inline "Add Section" row.
3. **ARAL Sections card** — its own card, containing only the ARAL
   table and its inline add row.
4. **Remedial/Enrichment Sections card** — its own card, containing
   only that table and its inline add row.

Each of the three table cards is independent — no more single
conjoined "Organized Classes Setup" card body stacking all tables
together.

The "Within Standard / Below Standard / Above Standard" stat boxes and
the Grade Filter pill row (All / Kinder / Grade 1 … / Non-Graded) are
removed entirely — not hidden, not moved, just gone. Per-table
filtering is replaced by the per-column filter row described below.

## Happy Path — Sections
1. School head lands on the page — the Summary card and the three
   section table cards are all visible without any tab switch.
2. Each card (Regular / ARAL / Remedial-Enrichment) shows its table
   with an "Add Section" button beneath it; inline-editable rows are
   the only add/edit interaction — no modal exists for adding or
   editing a section, in any of the three cards.
3. School head fills the inline row's fields and confirms.
4. Row is validated (required fields, no duplicate Section Name +
   Grade Level within that section type, no double-booking an adviser
   across sections) and, on success, saved into the local session draft
   and displayed as a normal table row.
5. School head can click Edit on any row to re-open it as an inline
   editable row, or Delete to remove it.

## Data & Inputs

**Regular Sections** — `sectionType`: `MONO GRADE` | `MULTIGRADE` | `NON GRADED`
| Field | Type | Required | Notes |
|---|---|---|---|
| Section Name | text | Yes | Uppercased on save; unique with Grade Level |
| Grade Level | select | Yes | Or 2–6 grades combined for a Multigrade section (Elementary only, Grades 1–6 only; a grade already used in one multigrade combo can't be reused in another) |
| Male Learners | number (0–99) | No | |
| Female Learners | number (0–99) | No | |
| Number of Learners | derived | — | Male + Female when either is set |
| Advisory Teacher | select (teaching personnel) | Yes (modal path) / recommended (inline path) | **1 section : 1 adviser** — a teacher already advising another regular section is blocked with an "Advisory Conflict" alert |

**ARAL Sections** — basis: Grade Level or Assessment Tool
| Field | Type | Required | Notes |
|---|---|---|---|
| Section Name | text | Yes | |
| Basis | Grade Level \| Assessment Tool | Yes | Assessment basis derives grade/name from the tool + proficiency level instead of a picked grade |
| Grade Level | select | Yes, if basis = grade | |
| Assessment Tool | CRLA (Reading Gr 1–3) \| Phil-IRI (Reading Gr 4–10) \| RMA (Math Gr 1–10) | Yes, if basis = assessment | Each tool has its own proficiency-level list (e.g. CRLA: Emerging → Reading at Grade Level) |
| Male / Female Learners | number | No | |
| Tutor | select (teaching personnel) | Yes | |

**Remedial / Enrichment Sections** — `interventionCategory`: `REMEDIAL` | `ENRICHMENT`
| Field | Type | Required | Notes |
|---|---|---|---|
| Intervention Category | Remedial \| Enrichment | Yes | |
| Section Name | text | Yes | |
| Grade Level | select | Yes | |
| Male / Female Learners | number | No | |
| Handling Teacher | select (teaching personnel) | No | |

## UI / Output
- No tab switcher. A Summary card (Total Enrolled M/F only) with the
  "Curriculum & Subjects Taught" button in its upper-right corner,
  followed by three independent table cards: Class Sections &
  Advisers (Regular), ARAL Sections, Remedial/Enrichment Sections.
- Each table card: row count, its own table, and an inline "Add
  Section" row. No modal anywhere in these cards.
- The "Curriculum & Subjects Taught" button opens the subject-catalog
  manager as a modal — see "Subjects Taught Workspace."
- Edit and Delete actions on every saved row, both inline — no Edit
  modal.
- **No** stat boxes for Within/Below/Above-Standard counts, and **no**
  Grade Filter pill row — both removed entirely.
- "Clear Organized Classes" utility button clears the local draft only
  (does not touch the database — explicit toast copy confirms this).

## Table Filtering & Sorting (every section table)
Applies identically to the Regular, ARAL, and Remedial/Enrichment
tables:
- A filter-input row sits directly beneath the column header row, one
  text filter box per column, filtering that table's rows live as the
  school head types (case-insensitive substring match against that
  column's displayed value).
- Every column header is clickable to sort by that column, toggling
  ascending/descending; numeric columns (♂/♀/Total/Learners) sort
  numerically rather than as text.
- Implemented as one shared hook (`client/src/hooks/useSortableFilterableTable.js`)
  plus a shared header component (`client/src/components/SortableTableHead.jsx`)
  reused by all three tables, so filter/sort behavior and styling stay
  consistent and any future table on the page can reuse them the same way.
- `getSectionSizeStatus`'s Below/Within/Above logic is not currently
  surfaced anywhere on the page (no per-row badge exists in any of the
  three tables, and its old summary-ribbon display is removed per this
  change) — the function itself is left in the codebase, unused, for a
  possible future per-row badge rather than deleted outright.

## States & Edge Cases
- Empty: a section-type card with zero sections shows an empty-state
  message in place of table rows; "Add Section"/inline-add stays
  available.
- Duplicate Section Name + Grade Level (add or edit/rename): blocked
  with an alert dialog; save does not proceed.
- Advisory conflict (a teacher already adviser of another regular
  section): blocked with an "Advisory Conflict" alert naming the
  conflicting section.
- Multigrade validation: 2–6 grades required, Elementary Grades 1–6
  only, and a grade already committed to one multigrade combination
  cannot be reused in another.
- Section Name is required on every add/edit; Number of Learners is
  intentionally derived from Male + Female rather than entered
  directly — inputs are clamped to 0–99 per gender field instead.
- Loading/error states follow the app's shared `showAlert` / `showToast`
  / `showConfirm` UI helpers from `AppContext`.

## Business Rules
- Section Name + Grade Level must be unique within each section-type
  table (Regular, ARAL, Remedial/Enrichment are independent uniqueness
  scopes) — enforced client-side against the in-memory `classSections`
  list before every add/edit.
- **1 regular section : 1 advisory teacher.** A teacher cannot be the
  adviser of more than one Regular section at a time; ARAL tutors and
  Remedial/Enrichment teachers are not subject to this constraint.
- Section-size standard bands (`getSectionSizeStatus`), used purely for
  the informational Below/Within/Above badge, not to block saving:
  Kinder <15/15–25/>25, Grades 1–3 <25/25–35/>35, Grades 4–6
  <30/30–45/>45, Grades 7–10 <35/35–45/>45, Grades 11–12 <30/30–40/>40.
- Adding or editing a section auto-creates/reconciles matching Workload
  rows for the assigned teacher (ADVISORY + HGP for Regular, REMEDIATION
  for Remedial, ENRICHMENT for Enrichment, ARAL TUTORING for ARAL);
  reassigning or removing a section's teacher removes the stale rows
  from the previous teacher.
- Multigrade sections combine 2–6 Elementary grades (1–6) into one
  section; grade levels are mutually exclusive across multigrade
  combinations.

## Subjects Taught Workspace (not in original spec)
The "Curriculum & Subjects Taught" button on the Summary card opens the
active subject catalog **as a modal** — this button is the only access
point to this workspace now that there is no tab switcher:
- A master subject catalog (`MASTER_SUBJECTS_CATALOG`) covering
  Elementary (per grade), Junior High School, and Senior High School
  (Core/Applied/Specialized/TechPro/SSHS variants), filtered by the
  school's actual curricular offering and active Special Curricular
  Programs.
- Each subject can be toggled enabled/disabled per school ("Check All"
  / "Uncheck All" bulk actions included); disabled state persists to
  `schoolInfo.subjectsConfig` and `localStorage` as a fallback.
- Custom subjects can be added per curriculum band (and SHS category);
  `ADVISORY`, `HGP`, and `MOTHER TONGUE` are permanently restricted
  from being added or shown, since those are handled as fixed workload
  rows rather than subjects.
- Search/filter by grade level (Elementary), SHS category, or free text.

## Data Persistence Model
- All add/edit/delete actions operate on an in-memory/local draft
  (`classSections` in `AppContext`), not a direct database write —
  changes are marked via `setHasUnsavedChanges(true)` and cached to
  IndexedDB/localStorage as a draft (`services/db.js`), consistent with
  the rest of the eSF7 setup flow.
- Nothing reaches PostgreSQL until the user proceeds through
  Validation Center / final submission — the section endpoints below
  exist for that submission step (and for reloading a school's saved
  sections), not for autosave-per-edit.

## Integration Points
- Backend: `server/controllers/class_sections/index.js`, mounted per
  `ARCHITECTURE.md`'s `server/controllers/<feature>/index.js` convention.
  - `GET /` — returns `regularSections`, `aralSections`,
    `remedialEnrichmentSections`, and a combined `allSections` array.
  - `POST /regular`, `POST /aral`, `POST /remedial-enrichment` — upsert
    (`ON CONFLICT`) per category.
  - `DELETE /regular/:id`, `DELETE /aral/:id`,
    `DELETE /remedial-enrichment/:id`, generic `DELETE /:id`,
    `DELETE /clear-all`.
- Tables: **one table per section type** (not a single discriminated
  table) — `esf7_regular_sections`, `esf7_aral_sections`,
  `esf7_remedial_enrichment_sections` — plus legacy/compat tables
  `esf7_class_sections` and `class_sections` still targeted by delete
  operations for cleanup.
- `AppContext.jsx`: `classSections` state plus
  `addClassSection` / `updateSectionDetails` / `updateSectionAdviser` /
  `updateSectionLearners` / `removeClassSection` local-draft helpers
  (`updateSectionAdviser`/`updateSectionLearners` are thin wrappers
  around `updateSectionDetails`).
- Follows existing eSF7 UI conventions (Plus Jakarta Sans font via
  global CSS, `card`/`card-inner` component patterns, `react-icons/fi`
  icon set).

## Out of Scope
- Bulk import of sections
- Assigning individual learners into sections
- Printing/export of section data
- Archiving sections by school year
- Hard section capacity limits that block saving (size standard is
  informational only — see Business Rules)

## Acceptance Criteria
- [x] Class Sections tab shows three cards (Regular, ARAL,
      Remedial/Enrichment), each with its own table and an inline
      "Add Section" row.
- [x] A section-type card with zero sections shows an empty state.
- [x] Saving a section with a missing Section Name is blocked with an
      inline/alert error.
- [x] Saving a duplicate Section Name + Grade Level within the same
      section type is blocked, for both new sections and edits/renames.
- [x] A teacher already advising another Regular section cannot be
      assigned as adviser to a second one (Advisory Conflict alert).
- [x] Existing sections can be edited and deleted from the table.
- [x] Number of Learners is derived from Male + Female counts (not a
      direct standalone input) — confirmed as intended product design.
- [x] No modal anywhere in the section tables (Regular / ARAL /
      Remedial-Enrichment): add/edit is fully inline in all three cards.
- [x] Subjects Taught opens as a modal, not a dedicated page/tab body.
- [x] "Class Sections & Advisers" and "Curriculum & Subjects Taught" tab
      buttons are removed from the header entirely.
- [x] A single "Curriculum & Subjects Taught" button sits in the
      upper-right corner of the Summary card and is the only way to
      open that modal.
- [x] The single "Organized Classes Setup" card is split into a
      Summary card (Total Enrolled only) plus one independent card per
      table (Regular / ARAL / Remedial-Enrichment).
- [x] Within/Below/Above-Standard stat boxes are removed entirely.
- [x] The Grade Filter pill row (All/Kinder/Grade 1…/Non-Graded) is
      removed entirely (the old free-text search box was also removed,
      superseded by the per-column filters below).
- [x] Every section table has a per-column filter-input row beneath its
      headers and every column header is clickable to sort.
- [x] Table filter/sort behavior is implemented via one shared
      hook + header component reused by all three tables, not
      duplicated per table.
