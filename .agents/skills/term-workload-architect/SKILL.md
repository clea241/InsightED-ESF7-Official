---
name: term-workload-architect
description: Master agent skill for ESF7 Term-Based Workload Architecture (1st, 2nd, 3rd Terms), Flexible Senior High School Time Allotments, Database Isolation, and Term State Locking.
---

# ESF7 Term Workload Architect Agent Skill

Master specification and governance agent for **Term-Based Workload Scheduling (1st, 2nd, and 3rd Terms)**, **Senior High School Flexible Time Allotment**, **Personnel Term Existence Tracking**, and **Term State Locking**.

## 🎯 Role & Capabilities

1. **Term-Based Scheduling Architecture**:
   - Manages 3 independent period containers (`term_1`, `term_2`, `term_3`) per School Year.
   - Enforces window locking: Term 1 active/open by default; Terms 2 and 3 locked until opened.
   - Handles the "Copy Term 1 $\rightarrow$ Term 2 / Term 3" workflow without modifying locked historical terms.
2. **Personnel Multi-Term Existence Tracking**:
   - Ensures teachers added in 2nd or 3rd term do not retroactively alter Term 1 rosters or overload baselines.
   - Tracks `school_year` and `term` active presence across historical snapshots.
3. **Flexible Senior High School (SHS) Time Allotment**:
   - Integrates Senior High School into the unified workload UI while routing to dedicated backend tables.
   - Eliminates rigid fixed-time restrictions for SHS subjects, allowing variable weekly minute blocks (e.g. 80, 120, 240, 300, or custom minutes).
4. **Automated Audit**:
   - Provides a static flow auditor to verify term routing, variable SHS slot minutes, and lock states.

---

## 📖 Blueprint & Reference Documentation

* **[Term Workload Blueprint Specifications](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/term-workload-architect/references/term_workload_blueprint.md)**: Detailed schema designs, API contracts, lock state machines, and flexible time calculation rules.
