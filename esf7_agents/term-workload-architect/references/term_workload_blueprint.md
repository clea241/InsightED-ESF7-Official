# ESF7 Term Workload & Flexible SHS Blueprint Specification

## 1. Term Architecture Overview

* **Supported Terms**: 1st Term (`1`), 2nd Term (`2`), 3rd Term (`3`).
* **Active Statuses**:
  * `OPEN` / `ACTIVE`: Currently accepting timetable modifications and new section assignments.
  * `LOCKED`: Read-only historical archive. Cannot be modified unless explicitly unlocked by School Head / Admin.
* **Initial State**:
  * Term 1: `OPEN`
  * Term 2: `LOCKED` (Upcoming)
  * Term 3: `LOCKED` (Upcoming)

---

## 2. Personnel Multi-Term Existence Tracking

* **Columns**: `school_year` (e.g. `'2025-2026'`), `term` (e.g. `1`, `2`, `3`), `is_active` (`BOOLEAN`).
* **Isolation Rule**:
  * When querying rosters or generating eSF7 for Term 1, only personnel with active existence in Term 1 are retrieved.
  * A new teacher hired in Term 2 gets encoded with `term = 2`, ensuring Term 1 historical rosters remain unaltered.

---

## 3. Senior High School (SHS) Flexible Time Allotment

* **UI Unification**: Senior High School sections (Grades 11 & 12) appear directly in the standard workload assignment interface without requiring a separate portal.
* **Flexible Minute Bounds**:
  * Unlike elementary/JHS subjects that enforce strict 45-60 min daily blocks, SHS subjects support variable duration blocks (e.g., 80, 120, 240, 300 minutes/week) and customizable daily frequencies (e.g., 2× 120 mins, 4× 60 mins).
* **Database Routing**:
  * General classes (Kinder - Grade 10) $\rightarrow$ `esf7_workload`
  * SHS classes (Grade 11 - Grade 12) $\rightarrow$ `esf7_shs_workload` (maintaining track, strand, and flexible semester/term subject codes).
