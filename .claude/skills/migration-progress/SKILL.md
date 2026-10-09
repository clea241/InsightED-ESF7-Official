---
name: migration-progress
description: Use immediately when anyone mentions eSF7 migrations / disaggregation from school_drafts into the normalized database tables, or asks to replicate, check, or show live migration progress for a task (e.g. task-3136), including running/failed/pending counts per batch from esf7_local.
---

# Live Migration Progress Skill

Automated, deterministic reporting skill for monitoring live electronic School Form 7 (eSF7) database disaggregation runs. Replicates the canonical "Live Migration Progress" report for task tracking across local PostgreSQL clusters (`esf7_local` and `insighted_esf7`).

## Immediate Reference Rule

Whenever a message mentions eSF7 migrations from `school_drafts` into their respective database tables (migration status, progress, how many schools are done, row counts), go straight to this skill's code. Do not search the repo or write new queries first:
- Status and progress: run `scripts/progress.js` (see Execution Guide below).
- The migration itself is `server/scripts/disaggregate_school_drafts.js`; read it only when the question is about how the migration works, never to report progress.

---

## Triggers & Scope
Invoke this skill whenever the user or agent needs to:
- Check or replicate live migration status for a background task (e.g., `task-3136`, `task-3060`, or any background migration job).
- Query live batch progress, including completed, running (in-flight), failed, and pending school counts.
- Inspect real-time committed row counts across normalized tables (`esf7_personnel_profile`, `esf7_regular_sections`, `esf7_workload_rows`, etc.).
- Verify mathematical reconciliation across batch totals (`completed + running + failed + pending = target`).

> [!IMPORTANT]
> **Strict Reusability Rule:** Agents must execute the pre-built scripts in `scripts/` instead of drafting or regenerating ad-hoc SQL queries or inline code. All queries are strictly read-only (`SELECT` operations only).

---

## Execution Guide

### Option 1: Cross-Platform Node Runner (Recommended)
```bash
node .claude/skills/migration-progress/scripts/progress.js --task task-3136
```

With custom database, stage, or format:
```bash
node .claude/skills/migration-progress/scripts/progress.js --task task-3136 --db esf7_local --stage "Stage 2"
node .claude/skills/migration-progress/scripts/progress.js --task task-3136 --format json
```

### Option 2: Bash Runner
```bash
.claude/skills/migration-progress/scripts/progress.sh --task task-3136
```

### Option 3: Direct Read-Only SQL Query
```bash
psql -h localhost -p 5432 -U postgres -d esf7_local -f .claude/skills/migration-progress/scripts/progress.sql
```

---

## Command Parameters

| Parameter | Alias | Default | Description |
| :--- | :--- | :--- | :--- |
| `--task` | `-t` | `task-3136` | Target background task ID or job identifier |
| `--db` | `-d` | `esf7_local` | Target PostgreSQL database (`esf7_local` or `insighted_esf7`) |
| `--stage` | `-s` | `Stage 2` | Migration stage name |
| `--format` | `-f` | `markdown` | Output formatting (`markdown` or `json`) |

---

## Canonical Output Format Specification

The output produced by the skill adheres to the following structure:

### 1. Header
```text
### ⏱️ Live Migration Progress (task-<id>)
```

### 2. One-Line Summary
```text
**Stage:** <stage> disaggregation migration | **State:** <RUNNING | PAUSED | COMPLETED | FAILED> | **Failures since resume:** <count>
```

### 3. Reconciled Metrics Table
```markdown
| Metric | Current Count | Target / Total |
| :--- | :--- | :--- |
| **Status** | 🟢 RUNNING / 🔴 FAILED / ✅ COMPLETED / ⏸️ PAUSED (<N> failures since resume) | — |
| **Schools Migrated (Completed)** | **<completed_count>** | <target_total> |
| **Active / In-Flight (Running)** | **<running_count>** | <target_total> |
| **Failed Schools** | **<failed_count>** | <target_total> |
| **Pending Schools** | **<pending_count>** | <target_total> |
| **Reconciled Total** | **<reconciled_total>** | **<target_total>** (100% reconciled) |
| **Completion Rate** | **<pct_complete>%** | 100.0% |
| **Processing Speed** | **<speed>** | — |
| **Estimated Time Remaining** | **<eta>** | — |
```

### 4. Normalized Tables Live Row Counts Table
```markdown
| Normalized Table | Live Committed Rows | Description |
| :--- | :--- | :--- |
| `esf7_personnel_profile` | **<count>** | Teacher & staff identity profiles |
| `esf7_regular_sections` | **<count>** | Class sections (Mono/Multi-grade) |
| `esf7_workload_rows` | **<count>** | Timetables & teaching load allocations |
| `esf7_school_profile` | **<count>** | Curricular offerings & special programs |
| `esf7_sned_sections` | **<count>** | Special Needs Education class sections |
| `esf7_als_sections` | **<count>** | Alternative Learning System sections |
```

### 5. Safety & Verification Audit
- Confirmation that all queries are strictly read-only (`SELECT`).
- Exact mathematical reconciliation check: `completed + running + failed + pending = target`.
- Transactional commit verification via `esf7_migration_log`.
- Explicit reporting of any unverified metadata (e.g., if a task log file is missing or inactive).

---

## Acceptance Criteria

1. **Zero Execution Errors:** The script must run cleanly with exit code `0`, returning formatted results without exceptions or unhandled rejections.
2. **Live Database Queries Only:** Counts must originate from real-time database queries against `school_drafts`, `esf7_migration_log`, and normalized tables. Never guess or rely on hardcoded / stale numbers.
3. **Strict Table Reconciliation:**
   $$\text{Completed} + \text{Running} + \text{Failed} + \text{Pending} = \text{Target}$$
   The sum of all four states must equal the total target count exactly.
4. **Transparency on Unverifiable Data:** If a task log file does not exist, or task runner information is inaccessible, the report must clearly flag this in the verification notes rather than inventing task runner status.
5. **Cluster & Security Isolation:** Strict enforcement of the loopback host and database allowlist (`esf7_local`, `insighted_esf7`), complying with Rule #1 of `.agents/AGENTS.md`.
