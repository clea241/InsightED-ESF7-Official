# Mapping endpoints to database tables

Read when `map_tables.js` leaves endpoints `partial` or `unresolved`, or a runtime table change disagrees with the static map.

What `map_tables.js` does:
1. Takes each endpoint's handler (named function, imported function, or inline arrow).
2. Scans its body for SQL string/template literals, extracts tables: `FROM`/`JOIN` -> read; `INSERT INTO`, `UPDATE`, `DELETE FROM`, `TRUNCATE` -> written. CTE names, aliases and functions are excluded.
3. Follows calls into functions defined in the same file and in relatively-required modules (controllers -> services -> repositories), up to 6 levels. Files listed in `database.queryWrapperFiles` (the pg wrapper) are not followed.
4. Validates each name against `information_schema.tables` (or, if the DB is unavailable, a static `CREATE TABLE` scan, which is reported as less certain). A prefixed name (`esf7_...`, `school_...`) that is not in the schema is listed as "referenced in code but missing from the schema". Intentional spellings (`esf7_perssonel_educ`) are noted, never flagged.
5. Notes `payload`/`data`/`json*` columns written by INSERT/UPDATE as `jsonbPayloadWrites` (whole-form JSON in one column).

Confidence:
- `resolved`: every SQL literal found had literal table names and every project function called was followed (a handler with no SQL says so in the notes).
- `partial`: some call could not be followed (function not found in the target file, depth limit, `query(variable)` whose SQL is not in the function).
- `unresolved`: a table name is built from a variable (`FROM ${table}`) or the handler body could not be found.

Resolving by hand: open the cited file:line, read what is substituted into the SQL, add the tables to the manifest entry, and set `tableMappingConfidence` to `partial` with a note. ORM/query-builder code (Knex, Sequelize, Drizzle) is not parsed by the script: map those from the model/table definitions and mark the endpoints accordingly.

Runtime confirmation uses `snapshot_tables.sql` (`pg_stat_user_tables` insert/update/delete counters). It is evidence only when the database was idle during the run; `statsNoisy` in `results.json` says whether it was. Counters lag about a second (`settleMs`).
