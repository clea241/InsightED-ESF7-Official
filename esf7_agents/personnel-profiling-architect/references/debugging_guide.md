# ESF7 Personnel Profiling Debugging & Flow Checklist

Use this guide when investigating issues, flow breaks, or unexpected behavior in [PersonnelProfile.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/PersonnelProfile.jsx).

---

## 🔍 Common Debugging Scenarios & Fix Patterns

### 1. Learning Area Service Years Overflow Warning Triggered Unexpectedly
* **Symptom**: User cannot enter years taught in a learning area cell, showing toast `"Total service limit reached"`.
* **Root Cause**: `firstServiceDate` missing or invalid format, or sum of years in other eras already equals total calculated service years.
* **Fix Check**: Verify `getMaxAllowedServiceYears` and `getCellMaxYears` return expected values and handle null/empty `firstServiceDate` strings cleanly.

### 2. Form Edits Disappear or Diverge After Reloading
* **Symptom**: User typed changes, refreshed the page, and saw old values or stale draft state.
* **Root Cause**: `localStorage.getItem('draft_personnel_' + id)` key out of sync with `activePersonnelId` or failed JSON parsing.
* **Fix Check**: Ensure `useEffect` on `activePersonnelId` properly loads and parses local draft state and handles fallback to `dbPerson`.

### 3. Shared Personnel Edits Allowed / Overwritten
* **Symptom**: Personnel shared from mother school (`isShared: true`) modified locally.
* **Root Cause**: Input fields or cell toggles missing `currentPerson.isShared` read-only guard.
* **Fix Check**: Verify write handlers (`handleToggleLearningAreaCell`, `handleYearsChange`, `savePersonnelChanges`) check `!currentPerson.isShared`.

### 4. RA 1080 Board Exam Input Appends Duplicate Suffixes
* **Symptom**: Eligibility field contains `RA 1080 (RA 1080 (MECHANICAL ENGINEER))`.
* **Root Cause**: User typed `RA 1080` into modal input box while code already wraps with `RA 1080 (...)`.
* **Fix Check**: Ensure input modal strips leading `RA 1080` prefixes before saving string.

---

## 🛠 Pre-Commit / Pre-Deployment Checklist

Before approving changes to `PersonnelProfile.jsx`:

- [ ] **Context Hooks intact**: `useApp()` supplies `personnel`, `activePersonnelId`, `savePersonnelChanges`.
- [ ] **Learning Area Matrix caps**: `getMaxAllowedServiceYears` and `getCellMaxYears` bounds enforced.
- [ ] **Local Draft Caching**: `localStorage` keys `draft_personnel_${id}` and `draft_learning_areas_${id}` properly maintained.
- [ ] **Shared Personnel Guards**: Read-only guards active for shared staff (`currentPerson.isShared`).
- [ ] **Static Audit Passes**: Run `node esf7_agents/personnel-profiling-architect/scripts/audit_profiling_flows.js`.
