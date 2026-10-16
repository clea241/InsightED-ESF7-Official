// Recognises "no database connection became free in time" errors so the central error handler can answer
// 503 + Retry-After (a retryable overload signal) instead of a 500.

// pg-pool: "timeout exceeded when trying to connect" (connectionTimeoutMillis);
// pg client: "Connection terminated due to connection timeout";
// PgBouncer: "query_wait_timeout" (SQLSTATE 08P01) and "no more connections allowed" (max_client_conn).
const POOL_TIMEOUT_PATTERNS = [
  /timeout exceeded when trying to connect/i,
  /connection terminated due to connection timeout/i,
  /query_wait_timeout/i,
  /no more connections allowed/i,
];

function isPoolAcquireTimeout(err) {
  const message = err && err.message ? String(err.message) : "";
  return POOL_TIMEOUT_PATTERNS.some((re) => re.test(message));
}

/** Whole seconds between 1 and 5, random so synchronised clients do not all return at the same moment. */
function jitteredRetryAfterSeconds(random = Math.random) {
  return 1 + Math.floor(random() * 5);
}

let poolTimeoutCount = 0;

function getPoolTimeoutCount() {
  return poolTimeoutCount;
}

function resetPoolTimeoutCount() {
  poolTimeoutCount = 0;
}

/** Express error middleware: pool-acquire timeouts answer 503 + jittered Retry-After; anything else is passed on untouched. */
function poolTimeoutHandler(err, req, res, next) {
  if (res.headersSent || !isPoolAcquireTimeout(err)) return next(err);
  poolTimeoutCount++;
  const retrySecs = jitteredRetryAfterSeconds();
  // Single-line summary with counter, no full stack trace
  console.error(
    `[DB Pool Timeout #${poolTimeoutCount}] ${req.method} ${req.originalUrl || req.url} -> 503 (database pool busy): ${err.message}`,
  );
  res.set("Retry-After", String(retrySecs));
  return res
    .status(503)
    .json({
      error: "The server is busy. Please try again in a moment.",
      retryAfter: retrySecs,
    });
}

/**
 * Direct error handler for controller try/catch blocks:
 * If err is a pool acquire timeout, fails fast with 503 + Retry-After and single-line log.
 * Otherwise forwards to next(err) or falls back to standard 500 JSON.
 */
function handleControllerError(err, req, res, next) {
  if (isPoolAcquireTimeout(err)) {
    return poolTimeoutHandler(err, req, res, next);
  }
  if (typeof next === "function") {
    return next(err);
  }
  return res.status(err.status || 500).json({ error: err.message });
}

module.exports = {
  isPoolAcquireTimeout,
  jitteredRetryAfterSeconds,
  poolTimeoutHandler,
  handleControllerError,
  getPoolTimeoutCount,
  resetPoolTimeoutCount,
};
