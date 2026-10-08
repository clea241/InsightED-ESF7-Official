---
name: organized-classes-architect
description: Master agent skill for ESF7 Organized Classes & Section Setup flows, 5-Card Layout (Regular, SNED Non-Graded, ALS, ARAL, Remedial/Enrichment), MCOC dynamic grade-level resolution, total school enrollment calculation, adviser qualification filtering, and Workload timetable integration. Use whenever modifying, refactoring, adding features to, or debugging client/src/pages/OrganizedClasses.jsx.
---

# ESF7 Organized Classes Architect Agent Skill

Master specification and workflow agent for [OrganizedClasses.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/OrganizedClasses.jsx).

## 🎯 Role & Capabilities

1. **5-Card Section Layout Architecture**:
   - **Row 1 (Full Width)**: `REGULAR SECTION` (Mono-grade & Multi-grade class sections across Elementary / JHS / SHS).
   - **Row 2 (2 Columns)**:
     - *Left Card*: `SNED (NON-GRADED)` (Rendered if SNED is checked in School Profile).
     - *Right Card*: `ALS` (Rendered if ALS is checked in School Profile).
   - **Row 3 (2 Columns)**:
     - *Left Card*: `ARAL SECTION` (Accelerated Recovery and Early Academic Learning).
     - *Right Card*: `REMEDIAL / ENRICHMENT` (Remedial and Enrichment class offerings).
2. **MCOC Dynamic Level Resolution**:
   - Single offering (e.g. Elementary only): Auto-locked to `SNED-ES (NON-GRADED)` or `ALS-ES` (no redundant dropdowns).
   - Multi-level offering (e.g. Integrated K-12): Dropdown dynamically populated matching active offerings (`ALS-ES`, `ALS-JHS`, `ALS-SHS`, `SNED-ES`, `SNED-JHS`).
3. **Enrollment Math Rules**:
   - `SNED (NON-GRADED)`: Learners ($Male + Female$) are **added to the School's Total Regular Enrollment** (affecting the 1,001+ student rule for Assistant School Head Designates).
   - `ALS`: Learners are **isolated** from regular total school enrollment (tracked for ALS LIS reporting).
4. **Adviser Qualification Matching**:
   - ALS sections: Adviser dropdown only lists teachers with **`ALS`** in their Teaching Tab (`assignedGradeLevels`).
   - SNED sections: Adviser dropdown only lists teachers with **`SNED (NON-GRADED)`** in their Teaching Tab (`assignedGradeLevels`).
   - Teachers already assigned to a **Regular section** remain **fully selectable** as advisers in SNED and ALS sections without being filtered out.
5. **Workload Timetable Integration**:
   - Auto-generates workload slots named strictly **`ALS`** or **`SNED`** (never `ADVISORY`).
   - Flexible duration (not locked to 60 minutes).

---

## 📖 Blueprint Documentation

The detailed technical specifications are maintained in:
* **[Organized Classes Blueprint Specifications](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/organized-classes-architect/references/organized_classes_blueprint.md)**
