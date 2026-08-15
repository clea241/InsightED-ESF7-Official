---
name: personnel-profiling-architect
description: Master agent skill for ESF7 Personnel Profiling flows, Learning Area matrix logic, service year capping math, education/eligibility options, local storage draft caching, and profile validation. Use whenever modifying, refactoring, adding features to, or debugging client/src/pages/PersonnelProfile.jsx.
---

# ESF7 Personnel Profiling Architect Agent Skill

Master specification and workflow agent for [PersonnelProfile.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/PersonnelProfile.jsx).

## 🎯 Role & Capabilities

1. **Profiling Blueprint Mastery**: Understands every context dependency (`useApp()`), form state handler, Learning Area taught matrix rule, service year cap calculation, education/eligibility option set, and local draft auto-save routine in `PersonnelProfile.jsx`.
2. **Versioned Flow Preservation**: Whenever new profiling fields, tabs, or modal options are added to `PersonnelProfile.jsx`, this agent appends the new flow specifications while preserving legacy flow specifications.
3. **Automated Audit**: Can run static checks against `PersonnelProfile.jsx` to ensure state dependencies, API calls, and local storage keys remain intact.
4. **Code Quality Enforcement**: Ensures code follows `code-reviewer` and `react-best-practices` guidelines.

---

## 📖 Blueprint & Reference Documentation

The detailed technical definitions for this skill are maintained in the following references:

* **[Personnel Profiling Blueprint Specifications](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/personnel-profiling-architect/references/profiling_blueprint.md)**: Full map of context hooks, Learning Area matrix rules, service year capping math, education & eligibility option sets, and local draft auto-save contracts.
* **[Personnel Profiling Debugging & Flow Checklist](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/personnel-profiling-architect/references/debugging_guide.md)**: Common failure points, service year cap overflows, local storage draft divergence, and shared teacher edit guards.

---

## 🔄 Standard Workflow for Personnel Profiling Modifications

Whenever the user asks to modify, enhance, or debug `PersonnelProfile.jsx`:

1. **Step 1: Inspect Current Blueprint**:
   * Review [profiling_blueprint.md](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/personnel-profiling-architect/references/profiling_blueprint.md) to understand existing contracts.
2. **Step 2: Flow Impact Analysis**:
   * Check impacted state handlers (`updatePersonnelInfo`, `savePersonnelChanges`, `handleToggleLearningAreaCell`, `handleYearsChange`, `draft_personnel_${id}`).
3. **Step 3: Preserve Legacy Flows**:
   * Ensure existing education degree options, eligibility modals (RA 1080), and service year bounds are not broken.
4. **Step 4: Execute Changes with Best Practices**:
   * Update [profiling_blueprint.md](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/personnel-profiling-architect/references/profiling_blueprint.md) to record new/modified flows under **Versioned Flow History**.
5. **Step 5: Run Verification Audit**:
   * Execute `node esf7_agents/personnel-profiling-architect/scripts/audit_profiling_flows.js` to ensure static flow validation passes.

---

## 🛠 Helper Scripts

* **Static Flow Auditor**:
  ```bash
  node esf7_agents/personnel-profiling-architect/scripts/audit_profiling_flows.js
  ```
