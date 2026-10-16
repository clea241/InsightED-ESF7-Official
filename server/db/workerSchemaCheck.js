// Boot-time check for the queue worker: are all the columns it writes present? Only run when
// QUEUE_CONSUMER_ENABLED=true. It reads information_schema and never changes anything; a mismatch is a warning, not a
// crash, so a single missing column cannot stop the process from starting (the affected jobs would fail and retry).
const { WORKER_COLUMNS } = require("../services/workerSchema");

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }} client
 * @param {Record<string, string[]>} [expected]
 * @returns {Promise<{ missingTables: string[], missingColumns: Record<string, string[]> }>}
 */
async function findMissingWorkerColumns(client, expected = WORKER_COLUMNS) {
  const tables = Object.keys(expected);
  const res = await client.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1)`,
    [tables],
  );
  const have = {};
  for (const row of res.rows) {
    (have[row.table_name] = have[row.table_name] || new Set()).add(
      row.column_name,
    );
  }
  const missingTables = [];
  const missingColumns = {};
  for (const table of tables) {
    if (!have[table]) {
      missingTables.push(table);
      continue;
    }
    const missing = expected[table].filter((c) => !have[table].has(c));
    if (missing.length) missingColumns[table] = missing;
  }
  return { missingTables, missingColumns };
}

/** Logs one warning listing what is missing (or one line saying all is well). Never throws. */
async function warnIfWorkerSchemaMismatch(client, expected = WORKER_COLUMNS) {
  try {
    const { missingTables, missingColumns } = await findMissingWorkerColumns(
      client,
      expected,
    );
    const parts = [
      ...missingTables.map((t) => `table ${t}`),
      ...Object.entries(missingColumns).map(
        ([t, cols]) => `${t}(${cols.join(", ")})`,
      ),
    ];
    if (parts.length === 0) {
      console.log(
        "✅ [Queue Worker] Schema check: all columns the worker writes exist.",
      );
      return false;
    }
    console.warn(
      `⚠️ [Queue Worker] Schema mismatch: the worker writes columns this database does not have, so jobs touching them will fail: ${parts.join("; ")}. ` +
        "Run docs/ops/worker-schema-check.sql, then see migrations/add_worker_schema_columns.js.",
    );
    return true;
  } catch (err) {
    console.warn(
      `⚠️ [Queue Worker] Schema check could not run: ${err.message}`,
    );
    return false;
  }
}

module.exports = { findMissingWorkerColumns, warnIfWorkerSchemaMismatch };
