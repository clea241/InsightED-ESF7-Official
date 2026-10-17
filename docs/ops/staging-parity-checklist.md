# Staging parity: first day of service, L&D, PhilSys

Why these three worked on localhost and not on staging, what changed, and exactly what to run on staging.

## What differed (found in the repo, not guessed)

| # | Difference | Effect on staging |
|---|---|---|
| 1 | `deploy_esf7_staging.py` only builds, packs, `npm install`s and restarts PM2. **It never runs a migration or a schema step.** | Any schema change made locally never reaches staging. |
| 2 | `server.js` runs `schema.sql` only when `esf7_school_profile` does **not** exist (or `FORCE_INIT_SCHEMA=true`), and `CREATE TABLE IF NOT EXISTS` never adds columns to an existing table. | A staging database created earlier stays at its old shape forever. |
| 3 | Columns the code reads and writes were only ever added **by hand** on a developer machine: `esf7_personnel_employment.actual_step`, `.school_reported_step`; `esf7_personnel_profile.school_head_level`, `.disabled_service_years`, `.deleted`. No migration, no `schema.sql` line. | The roster/profile queries that name them fail on staging. |
| 4 | The Room QR roster loader swallowed query errors (`.catch(() => ({ rows: [] }))`). | A missing column returned an **empty roster**, so the portal quietly showed blank fields (PhilSys, dates, L&D) instead of an error. Now it fails loudly. |
| 5 | Room QR's Approve & Merge wrote only `id, personnel_id, training_type, title, total_hours` for each L&D row. | Conductor, start/end dates and days were lost on every merge, in **every** environment, so the L&D tab looked different depending on how a record was last saved. Now the whole row is written. |
| 6 | `safeCoerceDate` fell back to `new Date(text).toISOString()` for free text such as "May 31, 2018". | On a server whose clock is not UTC the day moves back by one (checked: Manila clock gives 2018-05-30). Now read as a calendar day, identical on every server. |
| 7 | Nothing told you the schema was behind. | Now the server logs `SCHEMA BEHIND THE CODE` with the exact columns at startup. |

Environment variables are the same class of difference but cannot be compared from the repo: see "Check on the server" below.

## What was changed (one implementation for every environment)

- `server/db/personnelParity.js`: the single list of columns/types/keys the personnel code needs.
- `server/migrations/add_personnel_parity_columns.js`: additive, idempotent migration (adds missing columns, fixes a text date column to `date` only if every value is a date/empty/N/A, adds missing unique keys only when there are no duplicates, backfills **empty** first-day-of-service and PhilSys values from the row's own `raw_payload`). It never drops, deletes or overwrites.
- `server.js`: startup parity check (read-only).
- Room QR accept writes the full L&D row; Room QR roster loader no longer hides errors; it reads the same normalized tables and formatter as Personnel Profiling.
- Saving a profile now compares the record the server read back (after commit) with what was sent (first day of service, PhilSys, L&D row counts). A mismatch is an error, never "saved".

## Deploy steps (manual; the deploy script does not do these)

1. **Back up** staging first (at least `esf7_personnel_profile`, `esf7_personnel_employment`, `esf7_personnel_ld_trainings`, `esf7_personnel_learning_areas`).
2. Deploy the new code the usual way (`python deploy_esf7_staging.py`).
3. On the staging server, from the project root, with the staging `.env`:
   ```
   node server/migrations/add_personnel_parity_columns.js --dry-run   # preview, changes nothing
   node server/migrations/add_personnel_parity_columns.js             # apply
   node server/migrations/add_personnel_parity_columns.js --check     # must print: OK - this database matches the code.
   ```
   Lines starting `SKIP` mean something needs a human decision (non-date text in a date column, or duplicate keys); the script says which rows/groups. Fix those and re-run: it is safe to repeat.
4. `pm2 restart <app> --update-env`, then read the first log lines: you want `Personnel schema parity check passed.`; if you see `SCHEMA BEHIND THE CODE`, step 3 did not complete.
5. Hard-refresh the browser (Ctrl+F5) once so the new bundle replaces the cached one.

Recommended follow-up: add step 3 (`--check` at least) to `deploy_esf7_staging.py` and `deploy_esf7_prod.py` so a deploy fails loudly when the schema is behind.

## Check on the server (cannot be seen from the repo)

- Deployed version: `git -C <deploy dir> log -1` or compare the file hash of `server/db/personnelParity.js` with the local one; confirm the `client/dist` timestamp is from this deploy.
- `.env`: `DB_NAME` / `DATABASE_URL` must be the database you migrated (the app logs `Primary Pool connected -> ...` at start; `APP_ENV=staging` pins everything to `insighted_esf7_staging`). `VITE_API_BASE`/API base URL must point at staging, not an older host.
- `RUN_STARTUP_SCHEMA_INIT` does not create missing columns on an existing database; only the migration does.
- `TZ` of the server is no longer relevant to the stored day, but note it for the record.

## Verification checklist on staging

Use one test person (not a real teacher). All values are read **after a hard refresh**, i.e. from the database.

1. Log in as the school, open Personnel Profiling, pick the person.
2. Employment tab: set **Date of 1st Day of Service** to `May 31, 2018` → Save. The saving modal must show success; if it shows an error, the message names the field (that is the new verification).
3. L&D tab: add one NEAP training with conductor, start and end dates, days and hours → Save.
4. Personal tab: enter a **PhilSys number** (and leave "No PhilSys" unchecked) → Save.
5. Hard refresh (Ctrl+F5). Confirm the date still reads **May 31, 2018** (not May 30), the L&D row shows conductor/dates/days/hours exactly as entered, and the PhilSys number is present. No "Unsent Changes" prompt appears.
6. Open the **Room QR portal** for the same school, choose the same person (passcode, last name, birth year). Confirm the same first day of service, L&D row and PhilSys number are pre-filled.
7. In the portal, submit without changing anything, then in Room QR Management use **Approve & Merge**. Back in Personnel Profiling confirm the three values and the L&D conductor/dates/days are unchanged (they must not be blanked).
8. Server log: no `SCHEMA BEHIND THE CODE` and no 500s on `/api/room-profiling/roster`.
9. Optional DB check (read-only):
   ```sql
   SELECT e.first_service_date, p.philsys_no
     FROM esf7_personnel_employment e JOIN esf7_personnel_profile p ON p.id = e.personnel_id
    WHERE p.id = '<id>';
   SELECT title, conductor, start_date, end_date, days, total_hours
     FROM esf7_personnel_ld_trainings WHERE personnel_id = '<id>';
   ```

---

## Approve & Merge: "Unsupported table for executeMultiRowUpsert: esf7_personnel_ld_trainings"

**Cause.** The staging server is running an older build. The commit that registered `esf7_personnel_ld_trainings` in the upsert helper (`82a5775`) is newer than whatever PM2 is serving there; localhost has it. The table name itself is correct (`esf7_personnel_ld_trainings`, lowercase `ld`, matches `server/schema.sql`).

**What changed so it cannot happen quietly again**
- `server/controllers/room_profiling/upsertRegistry.js` is the single list of tables the merge writes. `executeMultiRowUpsert` no longer has its own switch; a unit test fails if the accept code writes a table that is not in the registry.
- Startup logs `SCHEMA BEHIND THE CODE` (now also naming any merge table missing from the database), and `node server/scripts/check_merge_pipeline.js` exits non-zero for the same condition. Add it to the deploy scripts.
- The accept transaction now reads everything back **before** `COMMIT` (profiles, employment, L&D row counts per person, learning areas, archive rows). Any mismatch or failed write rolls the whole thing back: the submission stays in the queue, existing personnel values are untouched, and the exact error reaches the banner. The queue status moves to approved only inside a transaction that verified itself and committed.
- The screen changes (queue, Verified Profiles, banner) only after the confirmed response; each new attempt clears the previous banner.

**Deploy steps**
1. Redeploy staging (`python deploy_esf7_staging.py`) so PM2 runs the current server code, then hard-refresh the browser.
2. `node server/migrations/add_personnel_parity_columns.js --check` (apply it first if it reports gaps; see above).
3. `node server/scripts/check_merge_pipeline.js` must print `OK`.

**Verification checklist**
1. Note the queue count and the Verified Profiles count.
2. In Room QR Management, approve ONE submission that includes an L&D training (e.g. ACUPIDO, MAEROSE). Expected: the saving modal shows success; no "Accept Operation Failed" banner.
3. Refresh. The queue count dropped by one and Verified Profiles rose by one.
4. Personnel Profiling → that teacher → L&D tab shows the training with conductor, dates, days and hours.
5. DB (read-only): `SELECT title, conductor, start_date, end_date, days, total_hours FROM esf7_personnel_ld_trainings WHERE personnel_id = '<id>';`
6. Failure path (optional, on a copy): the banner shows the backend's exact message, the submission is still "Submitted" in the queue, and approving again after the cause is fixed succeeds and clears the banner.
