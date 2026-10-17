// ONE list of the tables the Room QR "Approve & Merge" pipeline writes, shared by:
//   - executeMultiRowUpsert (the multi-row INSERT ... ON CONFLICT helper)  -> which tables it will accept
//   - the startup / deploy check below                                      -> every one must exist in the database
//   - the unit test                                                          -> every table the accept code uses is here
// Adding a table to the merge means adding it HERE, once. There is no second allowlist to forget.

// Tables written with executeMultiRowUpsert.
const UPSERT_TABLES = Object.freeze([
  "esf7_personnel_profile",
  "esf7_personnel_employment",
  "esf7_perssonel_educ", // sic: the real table name is spelled "perssonel"
  "esf7_personnel_learning_areas",
  "esf7_personnel_ld_trainings",
  "esf7_personnel_designations",
  "esf7_personnel_submission_archive",
]);

// Tables the merge touches in any other way (UPDATE / DELETE); they must exist too.
const OTHER_PIPELINE_TABLES = Object.freeze(["esf7_personnel_submission"]);

const PIPELINE_TABLES = Object.freeze([
  ...new Set([...UPSERT_TABLES, ...OTHER_PIPELINE_TABLES]),
]);

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Builds the INSERT ... ON CONFLICT statement for a registered table. Throws for a table that is not registered
 * (same message as before, so a mismatch is still recognisable) and for anything that is not a plain identifier.
 */
function buildMultiRowUpsertSql({
  tableName,
  columns,
  valueClauses,
  conflictTarget,
  doClause,
  retClause,
}) {
  if (!UPSERT_TABLES.includes(tableName)) {
    throw new Error(
      `Unsupported table for executeMultiRowUpsert: ${tableName}`,
    );
  }
  for (const c of columns) {
    if (!IDENTIFIER.test(c)) {
      throw new Error(`Invalid column name for ${tableName}: ${c}`);
    }
  }
  return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES ${valueClauses.join(", ")} ON CONFLICT ${conflictTarget} ${doClause} ${retClause}`;
}

/**
 * Read-only: every pipeline table must exist in the database. Returns the list of problems (empty = fine).
 * @param {(sql: string, params?: any[]) => Promise<{rows: any[]}>} query
 */
async function findMergePipelineProblems(query) {
  const problems = [];
  for (const table of PIPELINE_TABLES) {
    const r = await query("SELECT to_regclass($1) AS t", [table]);
    if (!r.rows[0] || !r.rows[0].t) {
      problems.push(`table missing in the database: ${table}`);
    }
  }
  return problems;
}

module.exports = {
  UPSERT_TABLES,
  PIPELINE_TABLES,
  buildMultiRowUpsertSql,
  findMergePipelineProblems,
};
