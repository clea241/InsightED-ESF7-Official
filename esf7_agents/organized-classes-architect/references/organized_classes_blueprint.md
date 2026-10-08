# ESF7 Organized Classes Technical Blueprint & Flow Specifications

This document serves as the authoritative blueprint for [OrganizedClasses.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/OrganizedClasses.jsx).

---

## 1. 5-Card Layout Structure

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   1. REGULAR SECTION                                   │
│  (Mono-grade & Multi-grade class sections across Elementary / JHS / SHS)               │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────┬─────────────────────────────────────────┐
│            2. SNED (NON-GRADED)              │                 3. ALS                  │
│  (Shown if SNED is checked in School Profile)│ (Shown if ALS is checked in School Profile)
│  • Auto-level or Elem/JHS selector           │ • Auto-level or Elem/JHS/SHS selector   │
│  • Section Name & Learners (Adds to Total)   │ • Section Name & Learners (ALS count)   │
│  • Adviser: Filtered to SNED-trained staff   │ • Adviser: Filtered to ALS-trained staff│
└──────────────────────────────────────────────┴─────────────────────────────────────────┘

┌──────────────────────────────────────────────┬─────────────────────────────────────────┐
│               4. ARAL SECTION                │        5. REMEDIAL / ENRICHMENT         │
│          (Reading & Math Interventions)      │        (Catch-up & Enhancement)         │
└──────────────────────────────────────────────┴─────────────────────────────────────────┘
```

---

## 2. Business Logic & Calculation Specifications

### A. Total Regular Enrollment Sum
* **Inclusions**:
  * Mono-grade regular sections (`sectionType === 'MONO GRADE'`)
  * Multi-grade regular sections (`sectionType === 'MULTI-GRADE'`)
  * SNED (Non-Graded) sections (`sectionType === 'SNED' || sectionType === 'NON-GRADED' || gradeLevel.includes('SNED') || gradeLevel.includes('NON-GRADED')`)
* **Exclusions**:
  * `ALS` sections
  * `ARAL` sections
  * `REMEDIAL` / `ENRICHMENT` classes
* **Formula**:
  $$\text{Regular Enrollment} = \sum_{\text{Regular} \cup \text{SNED}} (\text{Male Learners} + \text{Female Learners})$$

### B. MCOC Level Auto-Resolution
* **SNED**:
  * Elementary Only $\rightarrow$ Locked to `SNED-ES (NON-GRADED)`
  * Junior High Only $\rightarrow$ Locked to `SNED-JHS (NON-GRADED)`
  * Multi-Level $\rightarrow$ Selectable between `SNED-ES (NON-GRADED)` and `SNED-JHS (NON-GRADED)`
* **ALS**:
  * Elementary Only $\rightarrow$ Locked to `ALS-ES`
  * Junior High Only $\rightarrow$ Locked to `ALS-JHS`
  * Senior High Only $\rightarrow$ Locked to `ALS-SHS`
  * Multi-Level $\rightarrow$ Selectable matching offered bands (`ALS-ES`, `ALS-JHS`, `ALS-SHS`)

### C. Adviser Qualification Filter
* **ALS Advisers**: `personnel.filter(p => Array.isArray(p.assignedGradeLevels) && p.assignedGradeLevels.some(g => String(g).toUpperCase().includes('ALS')))`
* **SNED Advisers**: `personnel.filter(p => Array.isArray(p.assignedGradeLevels) && p.assignedGradeLevels.some(g => String(g).toUpperCase().includes('SNED') || String(g).toUpperCase().includes('NON-GRADED')))`
* **Multi-Assignment Co-existence**: Teachers already assigned as advisers in a Regular section are **fully selectable** in SNED and ALS sections without being filtered out.

### D. Workload Timetable Auto-Generation
* Auto-generated slot subject: strictly **`ALS`** or **`SNED`**.
* Flexible duration (resizable and movable, not constrained to 60 minutes).
