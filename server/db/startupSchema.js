// Helpers for the schema checks server.js runs at startup (initDB).

// RUN_STARTUP_SCHEMA_INIT: anything except false/0/no/off keeps today's behaviour (run the startup schema checks).
const startupSchemaInitEnabled = (env = process.env) =>
  !["false", "0", "no", "off"].includes(
    String(env.RUN_STARTUP_SCHEMA_INIT || "")
      .trim()
      .toLowerCase(),
  );

/**
 * Returns { query, close } for the startup DDL. It uses a direct connection (DB_DIRECT_PORT) so the DDL never goes
 * through PgBouncer in transaction mode; if that cannot be opened, it falls back to `pooledQuery` with a warning.
 * @param {(...args: any[]) => Promise<any>} pooledQuery
 * @param {{ createDirectPool?: () => any }} [deps]
 */
async function openStartupDdlRunner(pooledQuery, deps = {}) {
  try {
    const createDirectPool =
      deps.createDirectPool || require("./directPool").createDirectPool;
    const pool = createDirectPool();
    try {
      await pool.query("SELECT 1");
    } catch (err) {
      await pool.end().catch(() => {});
      throw err;
    }
    return {
      direct: true,
      query: (...a) => pool.query(...a),
      close: () => pool.end().catch(() => {}),
    };
  } catch (err) {
    console.warn(
      `[Startup Schema Init] Direct connection failed (${err.message}); using the pooled connection instead.`,
    );
    return {
      direct: false,
      query: (...a) => pooledQuery(...a),
      close: async () => {},
    };
  }
}

module.exports = { startupSchemaInitEnabled, openStartupDdlRunner };
