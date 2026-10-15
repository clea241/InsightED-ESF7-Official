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
function applyDirectPort(env = process.env) {
  const port = directPort(env);
  const changed = [];
  if (shouldRewrite(String(env.DB_PORT || ""), env) && env.DB_PORT !== port) {
    env.DB_PORT = port;
    changed.push("DB_PORT");
  }
  for (const name of URL_VARS) {
    if (!env[name]) continue;
    let url;
    try {
      url = new URL(env[name]);
    } catch {
      continue; // not a parseable URL: leave it alone
    }
    if (!url.hostname || !shouldRewrite(url.port, env)) continue;
    if (url.port === port || (!url.port && port === DEFAULT_DIRECT_PORT))
      continue;
    url.port = port;
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
