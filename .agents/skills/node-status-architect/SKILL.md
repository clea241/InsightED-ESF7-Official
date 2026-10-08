---
name: node-status-architect
description: Master agent skill for ESF7 Node Status Tracking, Snapshot Backup, and SQL Boolean Views architecture in insighted_esf7. Governs 2-tier school/personnel node tables, JSONB milestone snapshots, real-time boolean projections, and zero-bottleneck Local-First sync.
---

# ESF7 Node Status Architect Agent Skill

Master specification and lifecycle manager for the **ESF7 Node Status Tracking & Snapshot Backup System** in PostgreSQL `insighted_esf7`.

---

## 🚨 CRITICAL DATABASE INTEGRITY RULES (RULE #1)
1. **NEVER TOUCH, QUERY, TRUNCATE, OR MODIFY OTHER DATABASES IN THE CLUSTER**:
   - All operations are strictly isolated to `insighted_esf7`.
   - **NEVER** touch, truncate, drop, or alter other databases (`insightEd`, `STRIDE`, `OpDash`, `AGAP`, `dpa_database`, `hq_database`, `tlo_database`, `siif_database`, `users_database`, `chat_database`, `cloud_database`, `gmis_items`, `Infra_Database`, etc.).
2. **NEVER TOUCH, DROP, TRUNCATE, OR OVERWRITE `esf7_database` TABLE**:
   - Master historical data in `insightEd.esf7_database` MUST NEVER be touched or dropped under any circumstances.
3. **PRESERVE ALL EXISTING DATA**:
   - All DDL statements use `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE VIEW`. No existing data or tables may ever be dropped or deleted.

---

## 🏛️ Core Architecture: 2-Tier Node Status & Backup Tables

### 1. Table: `esf7_school_node_status` (1 School = 1 Row)
Tracks whole-school milestones, stores JSON snapshots of school nodes, and maintains live aggregate rollups:
- `school_id VARCHAR(255) NOT NULL` (PK)
- `school_year VARCHAR(50) NOT NULL DEFAULT 'SY 26-27'` (PK)
- `overall_status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS'`
- `overall_percentage INTEGER NOT NULL DEFAULT 0`
- `node_01_school JSONB NOT NULL DEFAULT '{}'::jsonb`
- `node_02_roster JSONB NOT NULL DEFAULT '{}'::jsonb`
- `node_05_requests JSONB NOT NULL DEFAULT '{}'::jsonb`
- `node_06_classes JSONB NOT NULL DEFAULT '{}'::jsonb`
- `node_10_overload JSONB NOT NULL DEFAULT '{}'::jsonb`
- `node_11_validation JSONB NOT NULL DEFAULT '{}'::jsonb`
- `personnel_summary JSONB NOT NULL DEFAULT '{"total_personnel":0,"profiling_completed":0,"workload_completed":0,"all_personnel_ready":false}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

### 2. Table: `esf7_personnel_node_status` (1 Personnel = 1 Row)
Tracks individual teacher milestones, stores per-teacher JSON snapshots (PRC, Learning Area Matrix, Workloads, Allowances), and enables teacher-level disaster recovery:
- `school_id VARCHAR(255) NOT NULL` (PK)
- `school_year VARCHAR(50) NOT NULL DEFAULT 'SY 26-27'` (PK)
- `personnel_id VARCHAR(255) NOT NULL` (PK)
- `personnel_name TEXT NOT NULL`
- `position_title TEXT DEFAULT ''`
- `category VARCHAR(50) DEFAULT 'TEACHING'`
- `is_school_head BOOLEAN DEFAULT false`
- `is_complete BOOLEAN DEFAULT false`
- `node_03_room_qr JSONB NOT NULL DEFAULT '{}'::jsonb`
- `node_04_profile JSONB NOT NULL DEFAULT '{}'::jsonb`
- `node_07_designation JSONB NOT NULL DEFAULT '{}'::jsonb`
- `node_08_workload JSONB NOT NULL DEFAULT '{}'::jsonb`
- `node_09_allowances JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

## 👁️ Real-Time SQL Boolean Views

### 1. `vw_esf7_school_node_progress`
Dynamically projects JSON node statuses joined with `schools_iern` into clean metadata and `TRUE`/`FALSE` booleans:
- **Geographic / School Identifiers**: `school_id`, `school_name`, `region`, `division`, `district`
- `is_node_01_school_completed` $\rightarrow$ `(node_01_school->>'status' = 'COMPLETED')`
- `is_node_02_roster_completed` $\rightarrow$ `(node_02_roster->>'status' = 'COMPLETED')`
- `is_node_05_requests_completed` $\rightarrow$ `(node_05_requests->>'status' = 'COMPLETED')`
- `is_node_06_classes_completed` $\rightarrow$ `(node_06_classes->>'status' = 'COMPLETED')`
- `is_node_10_overload_completed` $\rightarrow$ `(node_10_overload->>'status' = 'COMPLETED')`
- `is_node_11_validation_completed` $\rightarrow$ `(node_11_validation->>'status' = 'COMPLETED')`
- `is_all_personnel_completed` $\rightarrow$ `(personnel_summary->>'all_personnel_ready')::boolean`
- `is_all_nodes_completed` $\rightarrow$ True when all nodes and personnel rollups are complete.

### 2. `vw_esf7_personnel_node_progress`
Provides individual teacher boolean checklists:
- `is_room_qr_completed`, `is_profile_completed`, `is_designation_completed`, `is_workload_completed`, `is_allowances_completed`, `is_teacher_fully_completed`.

---

## 🚀 Zero-Bottleneck Sync Strategy
1. **Keystroke / Active Typing**: Writes exclusively to local **IndexedDB** in the browser (0ms latency, 0 database calls).
2. **Milestone Boundaries**: Writes to PostgreSQL tables **only** upon:
   - Clicking **"Proceed to Next Step"** (`completeNode()`).
   - Clicking **"Save Personnel"** or switching teacher tabs.
   - Closing an **"Add/Edit Section"** modal.
   - Official **Certification & Submission** (Node 11).
