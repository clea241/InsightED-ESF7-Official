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

### 3. Delegation Package HTML Export Fails to Load Data Offline
* **Symptom**: Downloaded delegation HTML package opens blank or displays invalid payload error.
* **Root Cause**: Base64 JSON encoding failure due to unescaped UTF-8 characters.
* **Fix Check**: Ensure JSON serialization uses `btoa(unescape(encodeURIComponent(JSON.stringify(payloadData))))`.

### 4. Weekly Workload Minute Total Includes Invalid / Duplicate Rows
* **Symptom**: Teacher total teaching load hours miscalculated.
* **Root Cause**: Non-teaching tasks or empty subject slots included in teaching load sum.
* **Fix Check**: Filter out empty or unassigned rows before summing slot durations.

---

## 🛠 Pre-Commit / Pre-Deployment Checklist

Before approving changes to `Workload.jsx`:

- [ ] **HGP Subject Normalization**: `normalizeSubjectName` converts variants to `'HGP'`.
- [ ] **Advisory/HGP Conflict Exception**: HGP within ADVISORY allowed without error flags.
- [ ] **Slot Duration Limits**: 60 mins max for Elem/JHS; 360 mins max for SHS.
- [ ] **Delegation HTML Exporter**: `generateWorkloadDelegationHTML` exports valid Base64 payload.
- [ ] **Static Audit Passes**: Run `node esf7_agents/workload-architect/scripts/audit_workload_flows.js`.
