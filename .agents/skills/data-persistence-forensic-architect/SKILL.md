---
name: data-persistence-forensic-architect
description: Master forensic agent skill for diagnosing and resolving data loss, missing records, silent save failures, PostgreSQL transaction abort cascades, and client-server draft sync mismatches in InsightED ESF7.
---

# Data Persistence Forensic Architect Agent Skill

Master diagnostic and architectural skill for detecting, isolating, and fixing issues where user data appears "missing", "erased", "not loading", or "repeatedly re-encoded" in InsightED ESF7.

---

## 🔍 Core Diagnostic Knowledge: Why Data Goes Missing

When school encoders report: *"We encoded our data 3 or more times and it is still missing after reload"*, the issue is almost never that data was deleted. It is caused by one of **4 architectural failure modes**:

### 1. The PostgreSQL Transaction Abort Cascade (`25P02`)
- **Mechanism**: The draft save handler (`handleSaveDraft` in `server/controllers/schools/drafts.js`) wraps the multi-table persistence in a single transaction (`BEGIN` ... `COMMIT`).
- **Fatal Trap**: If ANY query inside that transaction encounters an error (e.g. an invalid `ON CONFLICT` clause, a foreign key violation, or a missing table), PostgreSQL puts the entire transaction into an **ABORTED** state:
  ```text
  ERROR: current transaction is aborted, commands ignored until end of transaction block (25P02)
  ```
- **Silent Save Failure**: Even if the Javascript code wraps each step in a `.catch()`, catching the error in Node.js **does NOT reset PostgreSQL**. Any subsequent query on that client fails, and the final `COMMIT` fails and executes `ROLLBACK`.
- **Client Symptom**: The endpoint returns `HTTP 500`. To the user on that browser tab, the form remains filled so they assume it saved. But the database has **0 rows**. When they refresh the page, close the browser, or switch laptops, the screen reverts to empty.

### 2. The `ON CONFLICT` Constraint Mismatch
- In PostgreSQL, `ON CONFLICT (col1, col2)` **strictly requires** a corresponding `UNIQUE` constraint or unique index covering exactly `(col1, col2)`.
- **Primary Culprit in ESF7**:
  - `esf7_personnel_designations`: The table schema only defines `PRIMARY KEY (id)`.
  - The persistence query executed:
    ```sql
    ON CONFLICT (personnel_id, serialized_key) DO UPDATE SET ...
    ```
  - This immediately crashes with:
    ```text
    ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
    ```
  - Inside a transaction, this aborts the transaction, rolls back school profile, personnel profile, sections, and workloads!

### 3. Client-Side Draft Reconciliation & Outbox Buffer
- The client uses a Local-First architecture (`IndexedDB` outbox + `AppContext.jsx` draft selector).
- When a save returns `HTTP 500`, the data remains only in that specific device's browser `IndexedDB`.
- If the user opens the system on a **different laptop** or **different browser**:
  1. The new browser queries `GET /api/school/draft`.
  2. The server responds with `payload: null` or empty baseline (since the cloud transaction failed).
  3. The user sees an empty screen and believes everything was wiped out.

### 4. Curricular Offering UI Filtering (Hidden vs Deleted)
- For multi-level schools (Integrated, Junior + Senior High), sections and workloads for Grades 7–12 are filtered by the school's `curricular_offering` array in `esf7_school_node_status`.
- If the offering defaults or is corrupted to `["Elementary"]`, the UI hides Grades 7–12 sections from the Organized Classes tab. The rows still exist in the database, but the UI renders 0 sections.

---

## 🛠 Forensic Audit Checklist

When investigating data loading or missing data issues:

1. **Check Live Route Health**:
   - `PUT /api/school/draft` -> Must return `HTTP 200` with `{ version, updatedAt }`, NEVER `500`.
   - `GET /api/school/draft` -> Must load normalized relational tables without query timeouts.
2. **Audit Database Unique Constraints**:
   - Verify `esf7_personnel_designations` has `CONSTRAINT uq_personnel_designation UNIQUE (personnel_id, serialized_key)` OR change the query to upsert by primary key `id` with `SAVEPOINT`.
   - Verify `esf7_regular_sections` has `CONSTRAINT uq_regular_section_school_sy UNIQUE (school_id, school_year, grade_level, section_name)`.
3. **Audit Transaction Isolation**:
   - Use `SAVEPOINT` before risky child batch inserts:
     ```sql
     SAVEPOINT batch_savepoint;
     -- execute insert
     -- if error: ROLLBACK TO SAVEPOINT batch_savepoint;
     -- else: RELEASE SAVEPOINT batch_savepoint;
     ```
   - Ensure `school_drafts` legacy checks never run inside an active transaction without checking table existence beforehand.
4. **Audit Curricular Offerings**:
   - Verify `node_01_school->'curricular_offering'` matches `schools_iern.mcoc` in `users_database`.
