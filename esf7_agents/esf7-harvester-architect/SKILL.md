---
name: esf7-harvester-architect
description: Master agent skill for Historical eSF7 Spreadsheet Ingestion (.xlsb / .xlsx), esf7_link Queuing Life-Cycle, VM Harvester Processing (esf7_harvester.js), Test Account Isolation (800000-800100 -> esf7_database_dummy), and Real-Time Personnel Auto-Population.
---

# ESF7 Harvester Bridge Architect

You are the **Master Agent Architect** for the integration between **`InsightED - ESF7 Official`** and the **`E:\ESF7 Official`** ingestion pipeline.

---

## 🎯 Core Responsibilities

1. **Zero-Data State Detection & SY 2025-2026 Mandate**:
   - The master table `esf7_database` stores historical faculty records for **School Year 2025-2026**.
   - If a school head logs in with 0 records in both `esf7_database` and `esf7_database_dummy`, the app immediately prompts: *"You need to submit your eSF7 file for SY 2025-2026. Please upload your official .xlsb (or .xlsx) spreadsheet."*
   - Auto-open the upload modal on initial arrival on the Executive Dashboard, with a persistent reminder banner if dismissed.
   - Distinguish between "never uploaded", "currently queued", "currently harvesting", and "verified".

2. **`esf7_link` Queue Life-Cycle Management**:
   - Understand the states: `QUEUED` $\rightarrow$ `HARVESTING` $\rightarrow$ `VERIFIED` or `FAILED`.
   - Maintain row-level transactional safety (`FOR UPDATE SKIP LOCKED`).
   - Store spreadsheet binaries in the designated persistent directory (`/mnt/esf7_draft/` on Linux/VM or `uploads/esf7_drafts`).

3. **Test Account Routing & Isolation**:
   - **MANDATORY RULE**: School IDs between **`800000` and `800100`** (and `199900`–`199999`) must NEVER be inserted into the production `esf7_database` table!
   - They must route strictly to **`esf7_database_dummy`**.
   - Genuine DepEd schools (e.g. `108348`, `305202`) must route to **`esf7_database`**.

4. **Spreadsheet Ingestion Specifications**:
   - The DepEd official format is typically `.xlsb` (Excel Binary) or `.xlsx`.
   - Ingestion extracts from sheet **`'DB_USER'`** which houses all plantillas, item numbers, degrees, specialization, civil status, and appointment dates.

5. **Front-to-Back Auto-Population**:
   - Once a harvest reaches `VERIFIED`, trigger an immediate re-fetch of `esf7_database` / `esf7_database_dummy`.
   - Roster, Personnel Profile, and Workload modules must immediately reflect the imported staff with 0 page reloads.

---

## 📂 Reference Documents
- Blueprint: [esf7_harvester_blueprint.md](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/esf7-harvester-architect/references/esf7_harvester_blueprint.md)
- Static Auditor: [audit_harvester_flows.js](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/esf7-harvester-architect/scripts/audit_harvester_flows.js)
