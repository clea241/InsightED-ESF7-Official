// Scripts, migrations and admin tools must talk to PostgreSQL directly, never through PgBouncer in transaction
// mode (session SET, temp tables, advisory locks and DDL need one stable server connection).
//
// `require("../db/directPort")` as the FIRST require of such a script. It loads the same environment files as the
// app, then points the connection at DB_DIRECT_PORT before anything reads DB_PORT or a *_DATABASE_URL variable.
//
// DB_DIRECT_PORT defaults to 5432. To avoid breaking a developer machine that runs Postgres on another port,
// a port is only rewritten when DB_DIRECT_PORT is set explicitly, or when it is the usual PgBouncer port 6432.
require("../loadEnv");
const core = require("./directPortCore");

core.applyDirectPort();

module.exports = {
  applyDirectPort: core.applyDirectPort,
  directConnectionConfig: core.directConnectionConfig,
  directPort: core.directPort,
};
