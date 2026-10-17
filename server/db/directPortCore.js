// Pure port-rewriting logic (no environment loading, no side effects), shared by db/directPort.js (scripts) and
// db/directPool.js (server startup DDL). See db/directPort.js for the rules.

const DEFAULT_DIRECT_PORT = "5432";
const POOLER_PORT = "6432";
const URL_VARS = [
  "DATABASE_URL",
  "PRIMARY_DATABASE_URL",
  "STAGING_DATABASE_URL",
  "PROD_DATABASE_URL",
  "PRODUCTION_DATABASE_URL",
  "INSIGHTED_DATABASE_URL",
  "USERS_DATABASE_URL",
  "AUTH_DATABASE_URL",
];

function directPort(env = process.env) {
  const raw = String(env.DB_DIRECT_PORT || "").trim();
  if (/^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 65535) return raw;
  return DEFAULT_DIRECT_PORT;
}

function shouldRewrite(currentPort, env) {
  return Boolean(env.DB_DIRECT_PORT) || currentPort === POOLER_PORT;
}

/** Rewrites DB_PORT and the port inside *_DATABASE_URL variables on `env`. Returns the names it changed. */
const isLoopback = (host) =>
  ["127.0.0.1", "localhost", "::1", "[::1]"].includes(
    String(host || "").trim(),
  );

/**
 * Rewrites DB_PORT and the port inside *_DATABASE_URL variables on `env`. Returns the names it changed.
 *
 * DB_DIRECT_HOST (optional): when PgBouncer runs on the same machine as the app, "the direct port on the same host"
 * is NOT the database (the pooler forwards to a remote server, and a different Postgres may listen locally on 5432).
 * With DB_DIRECT_HOST set, a LOOPBACK host is replaced by it, so ops scripts reach the real server. Nothing else is
 * touched: a host that is already remote is never rewritten, and without DB_DIRECT_HOST behaviour is unchanged.
 */
function applyDirectPort(env = process.env) {
  const port = directPort(env);
  const directHost = String(env.DB_DIRECT_HOST || "").trim();
  const changed = [];
  if (shouldRewrite(String(env.DB_PORT || ""), env) && env.DB_PORT !== port) {
    env.DB_PORT = port;
    changed.push("DB_PORT");
  }
  if (directHost && isLoopback(env.DB_HOST) && env.DB_HOST !== directHost) {
    env.DB_HOST = directHost;
    changed.push("DB_HOST");
  }
  for (const name of URL_VARS) {
    if (!env[name]) continue;
    let url;
    try {
      url = new URL(env[name]);
    } catch {
      continue; // not a parseable URL: leave it alone
    }
    if (!url.hostname) continue;
    let touched = false;
    if (directHost && isLoopback(url.hostname) && url.hostname !== directHost) {
      url.hostname = directHost;
      touched = true;
    }
    if (
      shouldRewrite(url.port, env) &&
      !(url.port === port || (!url.port && port === DEFAULT_DIRECT_PORT))
    ) {
      url.port = port;
      touched = true;
    }
    if (!touched) continue;
    env[name] = url.toString();
    changed.push(name);
  }
  return changed;
}

/** Connection settings for a script that builds its own pg Pool/Client. Never contains the pooler port. */
function directConnectionConfig(env = process.env, overrides = {}) {
  const port = shouldRewrite(String(env.DB_PORT || ""), env)
    ? directPort(env)
    : Number(env.DB_PORT) || Number(DEFAULT_DIRECT_PORT);
  const host = env.DB_HOST || "127.0.0.1";
  const isLocal = host === "127.0.0.1" || host === "localhost";
  return {
    host,
    port: Number(port),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl:
      !isLocal && env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    ...overrides,
  };
}

module.exports = { applyDirectPort, directConnectionConfig, directPort };
