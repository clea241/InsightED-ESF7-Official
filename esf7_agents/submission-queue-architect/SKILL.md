---
name: submission-queue-architect
description: Master agent skill for ESF7 Local-First IndexedDB architecture, 46k school scale design, submission queue, and PostgreSQL transactional worker ingestion.
---

# ESF7 Submission Queue & Local-First Ingestion Architect

## 🎯 Architecture Overview (46k School Scale)
To serve 46,000+ public schools across the Philippines without database bottleneck or server crashes:

1. **Local-First on Device (IndexedDB Primary)**:
   - While School Heads edit School Profile, Roster, Personnel Profile, Organized Classes, and Workload:
     - **All state lives 100% inside the browser on-device in IndexedDB** (`draft_${schoolId}_${schoolYear}`) and localStorage (`draft_personnel_${id}`, `draft_learning_areas_${id}`).
     - **ZERO premature database writes or deletes.**
     - UI is instant, latency-free, and offline-resilient.
   - **Background Cloud Draft Sync (Option A)**: Debounced lightweight backup to `school_drafts` allows seamless device switching without database pollution.

2. **Real-Time Cross-School Coordination (Only Feature with Live DB)**:
   - Clustered & Reassigned teacher requests (`esf7_requests`) use real-time database events so School A (Mother) and School B (Satellite) can interact instantly.
   - **Data Ownership Rules**:
     - **Mother School (School A)**: Owns the teacher's full personnel profile (plantilla, civil status, birthdate, TIN, PhilSys, step increment, degree, major/minor, post-grad, PRC license, L&D trainings, learning area matrix) and School A teaching workload.
     - **Satellite / Receiving School (School B)**: Only holds basic identity (Name, PRN, position, deployment: CLUSTERED/REASSIGNED/BORROWED) + School B assigned teaching workload.
     - When School B submits, the queue worker **never overwrites** Mother School's master profile details.

3. **Validation Center Gate & Submission Queue**:
   - The school head completes all modules, passes 100% of validation checks, ticks the certification box, signs, and clicks **Certify and Submit eSF7**.
   - The browser bundles the complete snapshot JSON and enqueues it into `esf7_submission_queue` with status `'pending'`.

4. **VM Queue Worker Transactional Ingestion**:
   - Dedicated background processor runs in VM with controlled concurrency.
   - Wraps every school snapshot inside `BEGIN ... COMMIT / ROLLBACK`.
   - Ingests strictly in Parent-to-Child order with data type sanitizers and `ON CONFLICT` upserts:
     1. `esf7_school_profile`
     2. `esf7_personnel_profile` (Parent)
     3. Child tables: `esf7_personnel_employment`, `esf7_perssonel_educ`, `esf7_personnel_learning_areas`, `esf7_personnel_ld_trainings`, `esf7_personnel_designations`, `esf7_personnel_allowances`
     4. `esf7_regular_sections`, `esf7_aral_sections`, `esf7_remedial_enrichment_sections`
     5. `esf7_workload_rows`, `esf7_shs_workload_rows`, `esf7_workload_transfer`
   - On success: marks job as `'completed'`.
   - On error: rolls back transaction, marks job as `'failed'` with descriptive `error_message`, and continues queue processing.

---

## 🛡️ Critical Ingestion Safeguards
1. **Data Sanitization**: Sanitize numeric strings (`parseInt(val) || 1`), timestamps, and dates (`YYYY-MM-DD` or `null`) before SQL execution.
2. **Foreign Key Protection**: Ensure parent `esf7_personnel_profile` is inserted/upserted before child tables.
3. **Shared Teacher Workload Safety**: Workload rows carry `school_id`. Multiple schools can assign workloads to the same shared teacher without conflict.
4. **Resubmission Flow**: Resubmission generates a new submission queue job that cleanly overwrites the school's active school year records in the database.
