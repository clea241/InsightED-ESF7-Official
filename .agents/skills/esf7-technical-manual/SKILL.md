---
name: esf7-technical-manual
description: Guidelines and data validation rules for Electronic School Form 7 (eSF7) through InsightED.
---

# ESF7 Technical Manual: Core Logic & Validation Rules

This skill incorporates the official process flow and validation rules outlined in the `ESF7 Tool - Technical Manual.pdf` for accomplishing the Electronic School Form 7 (eSF7) in InsightED. Use this skill when implementing or refactoring validation checkers, form dependencies, and business rules.

---

## 1. Access & School Information
* **Pre-filled school data:** School ID, School Name, Region, Division, and District.
* **School-provided data:** Number of Shifts, School Year, and **Modified Curricular Offering (MCOC)**.

---

## 2. Personnel Enrollment & Duplicate Checking
* **TIN (Taxpayer Identification Number):** Serves as the primary unique identifier.
  * If a teacher does not have a TIN, the **"No TIN"** checkbox must be selected, generating a temporary system identifier.
* **Centralized Check:** The system must perform automated duplicate checking on **TIN, DepEd Email, and PhilSys (National ID)** across all schools before finalizing enrollment.

---

## 3. Position & Designation Logic
### School Head Validation Rules
Each school is restricted to a single accountable School Head:
* **Rule 1:** Only one (1) School Head is allowed per school.
* **Rule 2:** If a school designates a **Teacher-in-Charge (TIC)**, it cannot simultaneously designate a Principal or Officer-in-Charge (OIC).
* **Rule 3:** For clustered schools, only one school head role (Principal, OIC, or TIC) can be assigned at any given time.

---

## 4. Modified Curricular Offering (MCOC) & Grade Level Mapping
The grade levels a teacher can handle are strictly bounded by the school's MCOC:

| Modified Curricular Offering (MCOC) | Allowed Grade Levels |
| :--- | :--- |
| **All Offering** | Kinder, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 |
| **ES and JHS** | Kinder, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| **JHS with SHS** | 7, 8, 9, 10, 11, 12 |
| **Purely ES** | Kinder, 1, 2, 3, 4, 5, 6 |
| **Purely JHS** | 7, 8, 9, 10 |
| **Purely SHS** | 11, 12 |

> [!IMPORTANT]
> If a School Head or Head Teacher does **not** have an assigned teaching load, no grade level should be selected.

---

## 5. Education & Qualification Dependencies
To ensure data consistency, the system enforces the following dependency trees:

### A. College Degree
* **Education Degree:** If college degree is in Education, **Major** and **Minor** are required.
* **Non-College Graduates:** If "N/A" is selected, all succeeding college-prerequisite education fields (Post-Graduate, Discipline, etc.) must be disabled.

### B. Eligibility
* **Regular Plantilla (National Funding):** Teachers whose nature of appointment is REGULAR must have their eligibility set to either **LET** or **PBET**.
* **Related-Teaching (Teaching Experience Required):** Positions such as Principal, Assistant School Principal, and Head Teacher must have eligibility set to **LET** or **PBET**.
* **PRC Specialization:** If eligibility is **LET** or **PBET**, the **PRC Specialization** field becomes a required input. Otherwise, it is disabled/set to N/A.

---

## 6. Organized Classes & Advisership
* **Class Adviser Options:** The list of available advisers for a section is restricted to teaching personnel who handle that section's grade level.
* **Auto-Assignments:** When a teacher is assigned as a section's **Class Adviser**, the system must automatically inject:
  1. **Class Advising duties**
  2. **Homeroom Guidance Program (HGP)**
  into their workload list.

---

## 7. Workload Schedule Validations
Before a personnel's workload can be finalized, the following safety constraints must be verified:
1. **No Overlapping Schedules:** A personnel cannot have overlapping times on the same day.
2. **Single-Subject Schedule:** A class section cannot be scheduled for more than one subject at the exact same start and end time.
3. **Authorized Personnel:** Only authorized positions may be assigned specific tasks.
4. **Workload Redistribution:** Workloads can be reassigned temporarily or permanently only after updating the personnel's reporting status to *On Leave*, *Temporarily Not Reporting*, or *Permanently Not Reporting*.
