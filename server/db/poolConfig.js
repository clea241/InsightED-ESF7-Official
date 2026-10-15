// Pool sizes and timeouts read from the environment. Defaults equal the values that used to be hard-coded in
// db/index.js, so nothing changes until an env var is set.

const DEFAULT_POOL_MAX = {
  PG_POOL_MAX_PRIMARY: 8,
  PG_POOL_MAX_STAGING: 5,
  PG_POOL_MAX_PROD: 8,
  PG_POOL_MAX_INSIGHTED: 5,
  PG_POOL_MAX_USERS: 4,
};
const DEFAULT_CONNECT_TIMEOUT_MS = 15000;

/** Positive whole number from env, otherwise the fallback (with a warning when a value was given but is invalid). */
function positiveIntEnv(
  name,
  fallback,
  env = process.env,
  warn = console.warn,
) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === "") return fallback;
  const text = String(raw).trim();
  const n = Number(text);
  if (/^\d+$/.test(text) && Number.isSafeInteger(n) && n > 0) return n;
  warn(
    `[DB Pool] ${name}="${text}" is not a positive whole number; using ${fallback}.`,
  );
  return fallback;
}

/**
 * Max connections for one pool. The primary pool of a queue worker process (DB_POOL_ROLE=worker) is sized by
 * PG_POOL_MAX_WORKER, falling back to PG_POOL_MAX_PRIMARY, then to today's default of 8.
 */
function poolMax(envName, env = process.env, warn = console.warn) {
  const fallback = DEFAULT_POOL_MAX[envName];
  if (envName === "PG_POOL_MAX_PRIMARY" && env.DB_POOL_ROLE === "worker") {
    return positiveIntEnv(
      "PG_POOL_MAX_WORKER",
      positiveIntEnv(envName, fallback, env, warn),
      env,
      warn,
    );
  }
  return positiveIntEnv(envName, fallback, env, warn);
}

function connectTimeoutMs(env = process.env, warn = console.warn) {
  return positiveIntEnv(
    "PG_CONNECT_TIMEOUT_MS",
    DEFAULT_CONNECT_TIMEOUT_MS,
    env,
    warn,
  );
}

module.exports = {
  poolMax,
  connectTimeoutMs,
  positiveIntEnv,
  DEFAULT_POOL_MAX,
};
