---
name: roster-architect
description: Master agent skill for ESF7 Personnel Roster & Profile flows, school head single-principal validation, draft commitment, DepEd email policy, and profile navigation. Use whenever modifying, refactoring, adding features to, or debugging client/src/pages/Roster.jsx or client/src/pages/PersonnelProfile.jsx.
---

# ESF7 Roster Architect Agent Skill

Master specification and workflow agent for [Roster.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Roster.jsx) and [PersonnelProfile.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/PersonnelProfile.jsx).

## 🎯 Role & Capabilities

1. **Roster & Profile Blueprint Mastery**: Understands every context dependency (`useApp()`), school head assignment rule, plantilla category mapping, draft auto-fill commitment workflow, and profile view router.
2. **Versioned Flow Preservation**: Whenever new fields, tabs, or modal flows are added to `Roster.jsx` or `PersonnelProfile.jsx`, this agent appends the new flow specifications while preserving legacy flow specifications.
3. **Automated Audit**: Can run static checks against `Roster.jsx` to ensure state dependencies, confirmation dialogs, and validation logic remain intact.
4. **Code Quality Enforcement**: Ensures code follows `code-reviewer` and `react-best-practices` guidelines.

---

## 📖 Blueprint & Reference Documentation

The detailed technical definitions for this skill are maintained in the following references:

* **[Roster Blueprint Specifications](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/roster-architect/references/roster_blueprint.md)**: Full map of context hooks, school head rules, category options, search/filter algorithms, and profile navigation.
* **[Roster Debugging & Flow Checklist](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/roster-architect/references/debugging_guide.md)**: Common failure points, school head duplicate conflicts, draft commitment persistence, and email sanitization edge cases.

---

## 🔄 Standard Workflow for Roster & Profile Modifications

Whenever the user asks to modify, enhance, or debug `Roster.jsx` or `PersonnelProfile.jsx`:

1. **Step 1: Inspect Current Blueprint**:
   * Review [roster_blueprint.md](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/roster-architect/references/roster_blueprint.md) to understand existing contracts.
2. **Step 2: Flow Impact Analysis**:
   * Check impacted state handlers (`addPersonnel`, `deletePersonnel`, `toggleSchoolHead`, `commitDraftPersonnel`, `setActivePersonnelId`).
3. **Step 3: Preserve Legacy Flows**:
   * Ensure existing position category rules, draft commitment alerts, and school head constraints are not bypassed.
4. **Step 4: Execute Changes with Best Practices**:
   * Update [roster_blueprint.md](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/roster-architect/references/roster_blueprint.md) to record new/modified flows under **Versioned Flow History**.
5. **Step 5: Run Verification Audit**:
   * Execute `node esf7_agents/roster-architect/scripts/audit_roster_flows.js` to ensure static flow validation passes.

---

## 🛠 Helper Scripts

* **Static Flow Auditor**:
  ```bash
  node esf7_agents/roster-architect/scripts/audit_roster_flows.js
  ```
