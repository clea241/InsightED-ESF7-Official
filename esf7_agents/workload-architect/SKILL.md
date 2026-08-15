---
name: workload-architect
description: Master agent skill for ESF7 Workload & Timetable flows, HGP advisory nested rules, slot duration limits, delegation HTML packages, and schedule conflict resolution. Use whenever modifying, refactoring, adding features to, or debugging client/src/pages/Workload.jsx.
---

# ESF7 Workload Architect Agent Skill

Master specification and workflow agent for [Workload.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Workload.jsx).

## 🎯 Role & Capabilities

1. **Workload Blueprint Mastery**: Understands every context dependency (`useApp()`), subject normalization rule (`normalizeSubjectName`), Advisory/HGP conflict exclusion algorithm, slot duration limit (60 mins Elementary/JHS vs 360 mins SHS), delegation HTML package exporter (`generateWorkloadDelegationHTML`), and timetable matrix handler in `Workload.jsx`.
2. **Versioned Flow Preservation**: Whenever new subjects, timetable controls, or export options are added to `Workload.jsx`, this agent appends the new flow specifications while preserving legacy flow specifications.
3. **Automated Audit**: Can run static checks against `Workload.jsx` to ensure subject normalizers, conflict checkers, and delegation exporters remain intact.
4. **Code Quality Enforcement**: Ensures code follows `code-reviewer` and `react-best-practices` guidelines.

---

## 📖 Blueprint & Reference Documentation

The detailed technical definitions for this skill are maintained in the following references:

* **[Workload Blueprint Specifications](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/workload-architect/references/workload_blueprint.md)**: Full map of subject normalization rules, HGP & Advisory nested schedule conflict logic, slot duration bounds, delegation HTML package generator specs, and workload row attributes.
* **[Workload Debugging & Flow Checklist](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/workload-architect/references/debugging_guide.md)**: Common failure points, false schedule conflict warnings on HGP, slot duration limit overflows, and delegation HTML Base64 encoding errors.

---

## 🔄 Standard Workflow for Workload Modifications

Whenever the user asks to modify, enhance, or debug `Workload.jsx`:

1. **Step 1: Inspect Current Blueprint**:
   * Review [workload_blueprint.md](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/workload-architect/references/workload_blueprint.md) to understand existing contracts.
2. **Step 2: Flow Impact Analysis**:
   * Check impacted state handlers (`normalizeSubjectName`, `isAdvisoryOrHgpPair`, `generateWorkloadDelegationHTML`, workload row state).
3. **Step 3: Preserve Legacy Flows**:
   * Ensure existing HGP advisory nested interval rules and slot duration limits are not bypassed.
4. **Step 4: Execute Changes with Best Practices**:
   * Update [workload_blueprint.md](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/workload-architect/references/workload_blueprint.md) to record new/modified flows under **Versioned Flow History**.
5. **Step 5: Run Verification Audit**:
   * Execute `node esf7_agents/workload-architect/scripts/audit_workload_flows.js` to ensure static flow validation passes.

---

## 🛠 Helper Scripts

* **Static Flow Auditor**:
  ```bash
  node esf7_agents/workload-architect/scripts/audit_workload_flows.js
  ```
