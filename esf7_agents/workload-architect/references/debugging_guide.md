# ESF7 Workload Debugging & Flow Checklist

Use this guide when investigating issues, flow breaks, or unexpected behavior in [Workload.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Workload.jsx).

---

## 🔍 Common Debugging Scenarios & Fix Patterns

### 1. Homeroom Guidance (HGP) Flagged as Schedule Conflict inside Advisory
* **Symptom**: Red schedule conflict warning appears when HGP time slot falls within section ADVISORY block.
* **Root Cause**: `isAdvisoryOrHgpPair` exclusion check bypassed or subject string not normalized with `normalizeSubjectName`.
* **Fix Check**: Ensure subject string passes through `normalizeSubjectName` so `Homeroom Guidance` becomes `'HGP'`, and `isAdvisoryOrHgpPair` returns `true` for Advisory/HGP pairs.

### 2. Slot Duration Limit Error on Senior High Classes
* **Symptom**: 2-hour or 3-hour Senior High block (Grade 11/12) triggers "Max 60 minute slot exceeded" error.
* **Root Cause**: Category check treated Senior High slot as Elementary/JHS.
* **Fix Check**: Verify slot duration validator checks grade level / category: Elementary & JHS max is 60 minutes; Senior High (Grade 11 & Grade 12) max is 360 minutes (6 hours).

### 3. Work Immersion Monthly Total Not Adding to Overload Pay
* **Symptom**: Work Immersion hours entered in calendar grid do not reflect on Overload Pay calculation.
* **Root Cause**: `workImmersionSchedulesMap` or `totalMonthHours` calculation omitted from total teaching load summation.
* **Fix Check**: Ensure `totalMonthMins` is added 1-to-1 to regular weekly teaching minutes before evaluating overload thresholds.

### 4. Month Schedule Pattern Paste Fails or Overwrites Wrong Month
* **Symptom**: Clicking "Paste to [Month]" copies to wrong month or fails silently.
* **Root Cause**: `copiedPattern` source month index mismatch or `selectedYear` divergence.
* **Fix Check**: Verify `handleCopyMonthPattern` stores `sourceMonthIndex` and `sourceMonthName` and `handlePasteMonthPattern` maps target date strings (`YYYY-MM-DD`) correctly.

### 5. Weekend Teaching Days (`SAT`, `SUN`) Not Saving to Database
* **Symptom**: Toggling `SAT` or `SUN` day buttons resets on page reload.
* **Root Cause**: `row.days` array string serialization lost when converting to database column (`day_schedule` string vs `days` JSON array).
* **Fix Check**: Ensure `row.days` handles array conversion and checks `rowDays.some(d => s === 'SAT' || s === 'SUN')`.

### 6. Delegation Package HTML Export Fails to Load Data Offline
* **Symptom**: Downloaded delegation HTML package opens blank or displays invalid payload error.
* **Root Cause**: Base64 JSON encoding failure due to unescaped UTF-8 characters.
* **Fix Check**: Ensure JSON serialization uses `btoa(unescape(encodeURIComponent(JSON.stringify(payloadData))))`.

---

## 🛠 Pre-Commit / Pre-Deployment Checklist

Before approving changes to `Workload.jsx`:

- [ ] **HGP Subject Normalization**: `normalizeSubjectName` converts variants to `'HGP'`.
- [ ] **Advisory/HGP Conflict Exception**: HGP within ADVISORY allowed without error flags.
- [ ] **Slot Duration Limits**: 60 mins max for Elem/JHS; 360 mins max for SHS.
- [ ] **Weekend Days Support**: `['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN']` day selection supported.
- [ ] **Work Immersion Integration**: Calendar grid, `saveWorkImmersionSchedules`, and Overload 1-to-1 integration functional.
- [ ] **Month Schedule Copy/Paste**: `handleCopyMonthPattern` and `handlePasteMonthPattern` operational.
- [ ] **Delegation HTML Exporter**: `generateWorkloadDelegationHTML` exports valid Base64 payload.
- [ ] **Static Audit Passes**: Run `node esf7_agents/workload-architect/scripts/audit_workload_flows.js`.
