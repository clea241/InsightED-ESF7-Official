---
name: dashboard-architect
description: Master agent skill for ESF7 Dashboard flows, blueprint specs, data pipelines, business calculations, and UI event tracking. Use whenever modifying, refactoring, adding features to, or debugging client/src/pages/Dashboard.jsx.
---

# ESF7 Dashboard Architect Agent Skill

Master specification and workflow agent for [Dashboard.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Dashboard.jsx) and its associated components, data hooks, and business logic.

## 🎯 Role & Capabilities

1. **Flow & Blueprint Mastery**: Understands every context dependency, API state, data aggregation algorithm, modal lifecycle, and view switch in `Dashboard.jsx`.
2. **Versioned Flow Preservation**: Whenever new features or UI components are added to `Dashboard.jsx`, this agent appends the new flow contracts while preserving legacy flow specifications.
3. **Automated Audit**: Can run static checks against `Dashboard.jsx` to ensure state dependencies, cleanup routines, and props remain strictly aligned.
4. **Code Quality Enforcement**: Ensures code follows `code-reviewer` and `react-best-practices` guidelines (e.g., proper hook cleanups, memoization where appropriate, non-mutative state updates).

---

## 📖 Blueprint & Reference Documentation

The detailed technical definitions for this skill are maintained in the following references:

* **[Dashboard Blueprint Specifications](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/dashboard-architect/references/dashboard_blueprint.md)**: Full map of context hooks, API schemas, calculation algorithms (Age brackets, Plantilla appointment status, Teacher surplus/shortage math, Out-of-field KPI, SY 2026-2027 3-Term calendar overload pay), and navigation routes.
* **[Dashboard Debugging & Flow Checklist](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/dashboard-architect/references/debugging_guide.md)**: Common failure points, state sync bugs, missing props, and troubleshooting procedures.

---

## 🔄 Standard Workflow for Dashboard Modifications

Whenever the user asks to modify, enhance, or debug `Dashboard.jsx`:

1. **Step 1: Inspect Current Blueprint**:
   * Check [dashboard_blueprint.md](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/dashboard-architect/references/dashboard_blueprint.md) to understand existing contracts.
2. **Step 2: Flow Impact Analysis**:
   * Identify which calculations, context hooks (`useApp()`), or state hooks (`stats`, `isUploadModalOpen`) are impacted.
3. **Step 3: Preserve Legacy Flows**:
   * Ensure existing navigation targets (`setActiveView`), statistics cards, and DepEd 3-Term Calendar rules are not broken.
4. **Step 4: Execute Changes with Best Practices**:
   * Maintain defensive checks (e.g. `isCancelled` cleanup in `useEffect`, safe Date parsing for birthdates).
   * Update [dashboard_blueprint.md](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/dashboard-architect/references/dashboard_blueprint.md) to record new/modified flows under **Versioned Flow History**.
5. **Step 5: Run Verification Audit**:
   * Execute `node esf7_agents/dashboard-architect/scripts/audit_dashboard_flows.js` to ensure static flow validation passes.

---

## 🛠 Helper Scripts

* **Static Flow Auditor**:
  ```bash
  node esf7_agents/dashboard-architect/scripts/audit_dashboard_flows.js
  ```
