// Safety guard for the standalone DB verifier scripts (test:db, test:resilience). They write to the database they
// connect to, so they refuse to run unless every configured target is a local database whose name contains "test"
// (for example the one scripts/with-test-db.mjs starts). Require this BEFORE server/db.
const URL_VARS = [
  "DATABASE_URL",
  "PRIMARY_DATABASE_URL",
  "STAGING_DATABASE_URL",
  "AUTH_DATABASE_URL",
  "USERS_DATABASE_URL",
  "INSIGHTED_DATABASE_URL",
  "PROD_DATABASE_URL",
  "PRODUCTION_DATABASE_URL",
];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function problems(env = process.env) {
  const found = [];
  const targets = URL_VARS.filter((n) => env[n]);
  if (targets.length === 0 && !env.DB_NAME) {
    found.push("no database is configured (the default target is the production database)");
  }
  for (const name of targets) {
    try {
      const u = new URL(env[name]);
      const db = u.pathname.replace(/^\//, "");
      if (!LOCAL_HOSTS.has(u.hostname)) found.push(`${name} host "${u.hostname}" is not local`);
      if (!/test/i.test(db)) found.push(`${name} database "${db}" does not contain "test"`);
    } catch {
      found.push(`${name} is not a valid URL`);
    }
  }
  if (env.DB_NAME && !/test/i.test(env.DB_NAME)) found.push(`DB_NAME "${env.DB_NAME}" does not contain "test"`);
  if (env.DB_HOST && !LOCAL_HOSTS.has(env.DB_HOST)) found.push(`DB_HOST "${env.DB_HOST}" is not local`);
  return found;
}

function requireDisposableDb(env = process.env) {
  // When started through scripts/with-test-db.mjs, aim everything at that throwaway database. dotenv never
  // overrides variables that are already set, so this also beats the root .env.
  if (env.TEST_DATABASE_URL) {
    const t = new URL(env.TEST_DATABASE_URL);
    for (const n of URL_VARS) env[n] = env.TEST_DATABASE_URL;
    delete env.PROD_DATABASE_URL;
    delete env.PRODUCTION_DATABASE_URL;
    env.DB_HOST = t.hostname;
    env.DB_PORT = t.port || "5432";
    env.DB_NAME = t.pathname.replace(/^\//, "");
    env.DB_USER = decodeURIComponent(t.username);
    env.DB_PASSWORD = decodeURIComponent(t.password);
    env.DB_SSL = "false";
  }
  // Load .env as server/db will, so the check sees the real targets.
  require("../loadEnv");
  const found = problems(env);
  if (found.length) {
    console.error(
      `Refusing to run: this script writes to the database.\n - ${found.join("\n - ")}\nRun it through: node scripts/with-test-db.mjs -- npm run <script> --prefix server`,
    );
    process.exit(1);
  }
}

module.exports = { requireDisposableDb, problems };
