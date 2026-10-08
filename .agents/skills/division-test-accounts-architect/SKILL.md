---
name: division-test-accounts-architect
description: Master agent skill for DepEd Division Test Accounts (230 SDOs), MCOC Archetype Accounts (900223-900229), regional slug tokenization (with/without "city"), and dynamic dual-pool staging isolation (insighted_esf7_staging vs insighted_esf7). Use whenever modifying, auditing, or debugging division test logins, alias resolution, or database routing.
---

# Division Test Accounts & Staging Isolation Architect

Master specification, policy, and validation agent for **DepEd Division Test Accounts (`region.division.test`)**, **MCOC Archetype Accounts (`900223`–`900229`)**, and **Strict Dual-Pool Database Isolation** in InsightED ESF7.

---

## 🎯 Role & Core Principles

1. **1 Division = 1 Dedicated Account**:
   - Each of the 230 Schools Division Offices (SDO) in the Philippines is mapped to an isolated test account (`900001` – `900230`).
2. **Canonical Format & Universal City Handling**:
   - Canonical format: `<region_slug>.<division_slug>.test` (e.g. `rcar.benguet.test`, `r5.naga.test`, `rncr.pasig.test`).
   - **With and Without "City" Interchangeability**: Users can type `rncr.pasig.test` OR `rncr.pasigcity.test`, `r7.naga.test` OR `r7.nagacity.test`, `rcar.baguio.test` OR `rcar.baguiocity.test`. Both resolve to the exact same division demo school.
3. **Region-Scoped Disambiguation**:
   - Resolves duplicate division names across different regions accurately:
     - **San Fernando**: `r1.sanfernando.test` (La Union, ID 900012) vs `r3.sanfernando.test` (Pampanga, ID 900030).
     - **San Carlos**: `r1.sancarlos.test` (Pangasinan, ID 900011) vs `r6.sancarlos.test` (Negros, ID 900106).
     - **Naga**: `r5.naga.test` (Camarines Sur, ID 900085) vs `r7.naga.test` (City of Naga, Cebu, ID 900118).
     - **Cotabato**: `r12.cotabato.test` (North Cotabato, ID 900176) vs `rbarmm.cotabato.test` (Cotabato City, ID 900212).
4. **7 MCOC Archetype Accounts (`900223` – `900229`)**:
   - Pre-configured accounts for testing all curricular offerings, special programs, and inclusive setups:
     - `900223` / `mcoc.elem.test` / `mcoc.es.test`: Purely Elementary (SSES)
     - `900224` / `mcoc.jhs.test`: Purely Junior High School (SPA, SPJ, STE)
     - `900225` / `mcoc.shs.test`: Purely Senior High School (Standard K-12 Model)
     - `900226` / `mcoc.integrated.test` / `mcoc.is.test`: Integrated School (K-10)
     - `900227` / `mcoc.multigrade.test` / `mcoc.mg.test`: Multigrade Elementary (MG ES)
     - `900228` / `mcoc.k12.test` / `mcoc.complete.test`: Comprehensive K-12 (All Offerings)
     - `900229` / `mcoc.inclusive.test` / `mcoc.sned.test`: Special Inclusive Education (SNED/ALS/ARAL)
5. **Universal Test Passcode & Password**:
   - **`123456`** works across all 230 division test accounts and all 7 MCOC archetype accounts.
6. **🚨 Strict Dual-Pool Database Isolation (Rule #1 Preservation)**:
   - All test accounts (`900xxx`, `800xxx`, `199xxx`, `divtest-*`, `pilot-*`, `*.test`) **STRICTLY ROUTE TO `insighted_esf7_staging`**.
   - Live DepEd schools (e.g. `100115`, `502624`) route to **`insighted_esf7`**.
   - Testing or truncating test data **NEVER touches or alters production `insighted_esf7`**.

---

## 🗺️ Architecture & File Map

| Component | File Path | Description |
| :--- | :--- | :--- |
| **Test Division Registry** | `server/utils/divisionTestRegistry.js` | Contains 230 SDO definitions, 7 MCOC archetypes, alias generator, and `resolveTestDivision()`. |
| **Dual-Pool DB Router** | `server/db/index.js` | Exports `stagingPool`, `prodPool`, `getPoolForSchool()`, and `isDivisionOrTestAccount()`. |
| **Queue Ingestion Router** | `server/queue_worker.js` | Routes asynchronous background ingestion payloads to staging for test accounts. |
| **Auth Controllers** | `server/controllers/auth/index.js` | Supports login with password/passcode `123456` via handle, short alias, or 6-digit ID. |
| **School Metadata Controller** | `server/controllers/schools/index.js` | Returns accurate school names, regions, divisions, and curricular offerings for test accounts. |

---

## 🧩 Resolution Specification (`resolveTestDivision`)

```javascript
const { resolveTestDivision } = require('./server/utils/divisionTestRegistry');

// 1. By handle without "city"
resolveTestDivision('rncr.pasig.test') // -> Pasig City (900222)
resolveTestDivision('r5.naga.test')    // -> Naga City (900085)
resolveTestDivision('r7.naga.test')    // -> City of Naga, Cebu (900118)

// 2. By handle with "city"
resolveTestDivision('rncr.pasigcity.test') // -> Pasig City (900222)
resolveTestDivision('r5.nagacity.test')    // -> Naga City (900085)
resolveTestDivision('r7.nagacity.test')    // -> City of Naga, Cebu (900118)

// 3. By MCOC handle / alias
resolveTestDivision('mcoc.elem.test')     // -> Mabini ES (900223)
resolveTestDivision('mcoc.k12.test')      // -> Bicol Regional CHS (900228)

// 4. By School ID
resolveTestDivision('900085')             // -> Naga City (900085)
```

---

## 🛠 Automated QA & Verification Commands

Run these automated verification scripts to validate alias resolution and database isolation:

1. **Verify Alias Resolution (With/Without City & Disambiguation)**:
   ```bash
   node server/scripts/test_alias_resolution.js
   ```

2. **Verify 7 MCOC Archetype Accounts & Staging Routing**:
   ```bash
   node server/scripts/test_mcoc_accounts.js
   ```

3. **Verify Database Isolation & Zero Production Cross-Pollution**:
   ```bash
   node server/scripts/test_db_isolation.js
   ```
