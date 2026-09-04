# ESF7 Harvester Bridge & Queuing Technical Blueprint

---

## 1. Architectural Overview

The eSF7 Harvester Bridge connects the **InsightED School Head Portal** with the background **eSF7 Harvester Engine** running in the VM (`E:\ESF7 Official`).

```
[School Head UI] 
      │ (Uploads .xlsb/.xlsx file)
      ▼
[POST /api/esf7-upload]
      │
      ├─► Saves binary to disk (/mnt/esf7_draft/ or uploads/esf7_drafts/)
      └─► Inserts entry into `esf7_link` (status='QUEUED')
                │
                ▼ (PostgreSQL `esf7_link`)
[VM Harvester Worker: esf7_harvester.js]
      │
      ├─► Selects oldest QUEUED row with `FOR UPDATE SKIP LOCKED`
      ├─► Sets status='HARVESTING'
      ├─► Parses sheet 'DB_USER'
      │
      ├─► If School ID is 800000-800100 (or 1999xx)
      │     └─► INSERTS INTO `esf7_database_dummy` (Test Sandbox)
      │   Else
      │     └─► INSERTS INTO `esf7_database` (Official Production)
      │
      └─► Updates `esf7_link` to status='VERIFIED', row_count=N
                │
                ▼
[InsightED UI Polling]
      └─► Detects 'VERIFIED' -> Calls GET /api/personnel -> Auto-populates Roster
```

---

## 2. Table Specifications

### A. `esf7_link` (Queue Hub)
| Column | Type | Purpose |
| :--- | :--- | :--- |
| `school_id` | `TEXT` | 6-digit DepEd School ID (Primary identifier) |
| `iern` | `TEXT` | DepEd Institutional Entity Record Number |
| `semester` | `TEXT` | Cycle key (Default `'REGULAR'` or `'1ST SEM'`) |
| `status` | `TEXT` | Lifecycle state: `'QUEUED'`, `'HARVESTING'`, `'VERIFIED'`, `'FAILED'` |
| `file_path` | `TEXT` | Absolute path to the saved `.xlsb` or `.xlsx` file |
| `row_count` | `INTEGER` | Number of faculty records harvested |
| `summary` | `JSONB` | Breakdown of teaching, related teaching, and non-teaching |
| `uploaded_at` | `TIMESTAMPTZ` | Timestamp of upload |
| `updated_at` | `TIMESTAMPTZ` | Timestamp of last status change |
| `audit_remarks` | `TEXT` | Error details if status is `'FAILED'` |

### B. Sandbox Routing Rule (Harvester `targetTable`)
```javascript
function getTargetTable(schoolId, semester) {
  const numericId = parseInt(schoolId, 10);
  const isTestSchool = (numericId >= 800000 && numericId <= 800100) || String(schoolId).startsWith('1999');
  
  if (isTestSchool) {
    return 'esf7_database_dummy';
  }
  return semester === '1ST SEM' ? 'esf7_1st' : 'esf7_database';
}
```

---

## 3. UI State Progression in InsightED
1. **Empty State**: `personnel.length === 0` $\rightarrow$ Hero card displayed with upload CTA.
2. **Uploading State**: Progress bar uploading binary to server.
3. **Queued State**: File saved, job registered in `esf7_link` (`status = 'QUEUED'`).
4. **Harvesting State**: VM worker actively extracting personnel (`status = 'HARVESTING'`).
5. **Verified State**: `status = 'VERIFIED'` $\rightarrow$ UI triggers `refreshPersonnel()`, modal closes, roster displays imported teachers.
6. **Failed State**: `status = 'FAILED'` $\rightarrow$ Explains error from `audit_remarks` with retry option.
