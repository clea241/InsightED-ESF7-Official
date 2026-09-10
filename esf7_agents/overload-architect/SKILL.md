---
name: overload-architect
description: Master agent skill for DepEd Electronic School Form 7 (eSF7) Teaching Overload Computation, 3-Term Academic School Calendar, End-of-Term Non-Overload Exclusions, Fiscal Year (FY) Quarterly Reporting, Step Increment Hourly Rates (PHTR), and Liquidation Payroll.
---

# Overload Architect Master Skill

## 1. Architectural Principles & Business Rules

### Term-Based Overload Computation
- **Core Engine**: Overload calculation is fundamentally grounded on **School Calendar Terms** (Term 1, Term 2, Term 3).
- **Dual Filter Modes**: In Step 6, users can filter by **School Calendar Term** (Academic review) or by **Fiscal Year Quarter (FY Q1 - Q4)** (Government Budget & Liquidation claims).
- **Monthly-to-Term Aggregation**: Daily and weekly granular sub-columns are condensed into clear **Monthly Breakdown columns** followed by the **Total Net Hours Per Term / Quarter** and **Computed Overload Pay (₱)**.

### End-of-Term Exclusion Policy (0 Hours Overload)
- **Rule**: During **End-of-Term blocks** and **Vacation periods**, standard classroom contact instruction stops (activities shift to test grading, forms completion, graduation/clearance, and conferences).
- **Policy**: **No Overload Pay is earned during End-of-Term or Vacation dates**.
- **Execution**: All calendar dates within End-of-Term and Vacation ranges are strictly zeroed out (`0 hours`) in daily schedules, absence deductions, and monthly aggregations.

---

## 2. Official DepEd 3-Term School Calendar (SY 2026–2027)

| Term / Period | Block Name | Date Range | Overload Eligibility |
| :--- | :--- | :--- | :---: |
| **Term 1** | Opening & Instructional Block | **June 8 – September 1, 2026** | **ACTIVE OVERLOAD** |
| | End-of-Term Block | **September 2 – September 15, 2026** | ❌ **EXCLUDED (0h)** |
| **Term 2** | Instructional Block | **September 16 – December 4, 2026** | **ACTIVE OVERLOAD** |
| | End-of-Term Block | **December 7 – December 18, 2026** | ❌ **EXCLUDED (0h)** |
| | Holiday Break | **December 19, 2026 – January 3, 2027** | ❌ **EXCLUDED (0h)** |
| **Term 3** | Instructional Block | **January 4 – March 23, 2027** | **ACTIVE OVERLOAD** |
| | End-of-Term Block | **March 24 – April 8, 2027** | ❌ **EXCLUDED (0h)** |
| **Vacation / EOSY** | Summer / Vacation Break | **April 9 – June 6, 2027** | ❌ **EXCLUDED (0h)** |

---

## 3. Fiscal Year (FY) Quarterly Mapping

1. **FY Q1 (January, February, March)**:
   - Covers: **Term 3 Instructional Block** (Jan 4 – Mar 23).
   - Excludes: Jan 1–3 (New Year break), Mar 24–31 (Term 3 End-of-Term).
2. **FY Q2 (April, May, June)**:
   - Covers: **Term 1 Instructional Block** (June 8 – June 30).
   - Excludes: April & May (Vacation), June 1–5 (Pre-SY Prep).
3. **FY Q3 (July, August, September)**:
   - Covers: **Term 1 Instructional Block** (July 1 – Sept 1) + **Term 2 Instructional Block** (Sept 16 – Sept 30).
   - Excludes: Sept 2–15 (Term 1 End-of-Term).
4. **FY Q4 (October, November, December)**:
   - Covers: **Term 2 Instructional Block** (Oct 1 – Dec 4).
   - Excludes: Dec 7–18 (Term 2 End-of-Term), Dec 19–31 (Holiday break).

---

## 4. UI & Presentation Specifications for Step 6

- **Stepper Layout**:
  - Filter Controls: **Select Term** (`Term 1`, `Term 2`, `Term 3`) + **Select FY Quarter** (`FY Q1`, `FY Q2`, `FY Q3`, `FY Q4`).
  - Table Columns:
    1. `Teacher Name`
    2. `Position`
    3. `Month 1 Net Hours`
    4. `Month 2 Net Hours`
    5. `Month 3 Net Hours`
    6. `Total Net Overload Hours (Term / FY)`
    7. `PHTR Rate (₱/hr)`
    8. `Computed Overload Pay (₱)`
    9. `Reason for Overload`
