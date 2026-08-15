# ESF7 Roster & Personnel Profile Debugging & Flow Checklist

Use this guide when investigating issues, flow breaks, or unexpected behavior in [Roster.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Roster.jsx) or [PersonnelProfile.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/PersonnelProfile.jsx).

---

## 🔍 Common Debugging Scenarios & Fix Patterns

### 1. Multiple School Heads Assigned Simultaneously
* **Symptom**: Dashboard or roster shows 2+ personnel flagged as School Head (`isSchoolHead === true`).
* **Root Cause**: `toggleSchoolHead` called directly without checking existing heads, or Add Personnel form bypassed `checkIsHead` validation.
* **Fix Check**: Ensure `toggleSchoolHead` replaces existing head or prompts user confirmation via `showConfirm`.

### 2. Non-Teaching Staff Toggled as School Head
* **Symptom**: Administrative Officer or Nurse gets designated as School Head.
* **Root Cause**: Disabled attribute on checkbox input ignored or missing `isNonTeaching` check.
* **Fix Check**: Verify `isNonTeaching` condition (`p.type === 'non-teaching' || p.type === 'non_teaching'`) disables input and guards `onChange`.

### 3. Auto-Fill Draft Banner Persists After Save
* **Symptom**: "Unsaved Auto-Fill Records Detected" warning banner remains visible even after clicking "Save Changes".
* **Root Cause**: `commitDraftPersonnel()` did not clear `isDraft` property on personnel objects in `AppContext` state.
* **Fix Check**: Verify `commitDraftPersonnel` updates backend API and updates local `personnel` array to set `isDraft: false`.

### 4. DepEd Email Validation Errors or Appends Duplicate `@deped.gov.ph`
* **Symptom**: DepEd email ends up formatted as `user@deped.gov.ph@deped.gov.ph`.
* **Root Cause**: Full email string passed into `depedEmailLocal` field before suffix concatenation.
* **Fix Check**: Ensure `depedEmailLocal` holds ONLY the username local part and regex strips existing `@deped.gov.ph`.

### 5. Profile / Workload Button Opens Blank Record
* **Symptom**: Clicking "Profile" or "Work" button navigates to view but displays blank profile or "Personnel Not Found".
* **Root Cause**: `setActivePersonnelId(p.id)` not called before `setActiveView('profile')` or `setActiveView('workload')`.
* **Fix Check**: Ensure `setActivePersonnelId(p.id)` precedes `setActiveView(...)`.

---

## 🛠 Pre-Commit / Pre-Deployment Checklist

Before approving changes to `Roster.jsx` or `PersonnelProfile.jsx`:

- [ ] **School Head Single-Principal Guard**: Single School Head rule enforced.
- [ ] **Non-Teaching Guard**: Non-teaching personnel cannot be School Head.
- [ ] **Draft Persistence**: `isDraft` records handled correctly.
- [ ] **Email Sanitization**: DepEd email sanitized with `/[^a-z0-9.]/g`.
- [ ] **Navigation Sequences**: `setActivePersonnelId` followed by `setActiveView`.
- [ ] **Static Audit Passes**: Run `node esf7_agents/roster-architect/scripts/audit_roster_flows.js`.
