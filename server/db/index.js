const pg = require("pg");
const { Pool } = pg;
const { AsyncLocalStorage } = require("async_hooks");

// Load consolidated environment configuration and synthesize database variables
require("../loadEnv");

// Prevent timezone-shifting of DATE columns by returning raw strings
pg.types.setTypeParser(1082, (val) => val);

let dbHost = process.env.DB_HOST;
let dbUser = process.env.DB_USER;
let dbPassword = process.env.DB_PASSWORD;
let dbPort = process.env.DB_PORT || "5432";
let defaultDbName = process.env.DB_NAME || "insighted_esf7";

const primaryConnUrl =
  process.env.PRIMARY_DATABASE_URL || process.env.DATABASE_URL;

if (primaryConnUrl) {
  try {
    const parsedDbUrl = new URL(primaryConnUrl);
    dbHost = dbHost || parsedDbUrl.hostname;
    dbPort = dbPort || parsedDbUrl.port || "5432";
    dbUser = dbUser || decodeURIComponent(parsedDbUrl.username);
    dbPassword = dbPassword || decodeURIComponent(parsedDbUrl.password);
    if (
      !process.env.DB_NAME &&
      parsedDbUrl.pathname &&
      parsedDbUrl.pathname.length > 1
    ) {
      defaultDbName = decodeURIComponent(parsedDbUrl.pathname.slice(1));
    }
  } catch (err) {
    // If not a parseable URL, will be caught by missing field validation below
  }
}

if (!dbHost || !dbUser || !dbPassword) {
  throw new Error(
    "Missing required database configuration: DB_HOST, DB_USER, and DB_PASSWORD (or DATABASE_URL) must be set in the environment. Hardcoded production Azure defaults have been removed to prevent unintended connections.",
  );
}

// The read-only master database (esf7_database, esf7_database_dummy, unit1_school_identity). Its name is case-sensitive in a
// connection string ('insightEd' != 'insighted'). It is configured via INSIGHTED_DATABASE_URL or INSIGHTED_DB_NAME.
// Default to defaultDbName so reads and writes share the same working database unless explicitly pointed elsewhere.
const masterDbName = process.env.INSIGHTED_DB_NAME || defaultDbName;
const isLocalHost = dbHost === "127.0.0.1" || dbHost === "localhost";
const dbSsl =
  !isLocalHost &&
  (process.env.DB_SSL === "true" || dbHost.includes("azure.com"))
    ? { rejectUnauthorized: false }
    : process.env.DB_SSL === "true" && !isLocalHost
      ? { rejectUnauthorized: false }
      : false;

// When running load capacity tests or targeting a test database, strictly guard all pools to prevent accidental production/staging routing
const isLoadTestMode =
  process.env.NODE_ENV === "load-test" ||
  defaultDbName.includes("test") ||
  (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("test"));

// Staging environment detection: if APP_ENV is staging, IS_STAGING is true, or DB_NAME is insighted_esf7_staging,
// all operations must be strictly confined to insighted_esf7_staging and NEVER route to production insighted_esf7.
const isStagingEnv =
  process.env.APP_ENV === "staging" ||
  process.env.IS_STAGING === "true" ||
  defaultDbName === "insighted_esf7_staging" ||
  (primaryConnUrl && primaryConnUrl.includes("insighted_esf7_staging"));

// Base configuration with bounded connection timeout and quick idle recovery
const baseConfig = {
  ssl: dbSsl,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  idleTimeoutMillis: 10000, // Reclaim idle connections after 10s
  connectionTimeoutMillis: 15000, // Fail fast at 15s instead of hanging indefinitely
};

// Lazy pool references (instantiated on first access)
let _pool = null;
let _stagingPool = null;
let _prodPool = null;
let _insightEdPool = null;
let _usersDbPool = null;

// 1. Primary Pool (env configured)
function getPool() {
  if (!_pool) {
    const connStr =
      process.env.PRIMARY_DATABASE_URL ||
      process.env.DATABASE_URL ||
      `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${defaultDbName}`;
    console.log(
      `📦 [DB Pool] Primary Pool connected -> database: "${defaultDbName}" on ${dbHost}:${dbPort}`,
    );
    _pool = new Pool({
      ...baseConfig,
      max: 8,
      connectionString: connStr,
    });
    _pool.on("error", (err) =>
      console.warn(
        "[Database Pool Client Error (Auto-recovering)]:",
        err.message,
      ),
    );
  }
  return _pool;
}

// 2. Explicit Staging Pool (for division test accounts & staging QA)
function getStagingPool() {
  if (isLoadTestMode || isLocalHost || isStagingEnv) {
    return getPool();
  }
  if (!_stagingPool) {
    const connStr =
      process.env.STAGING_DATABASE_URL ||
      (primaryConnUrl
        ? primaryConnUrl.replace(/\/[^/?]+(\?|$)/, `/insighted_esf7_staging$1`)
        : `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/insighted_esf7_staging`);
    console.log(
      `📦 [DB Pool] Staging Pool connected -> database: "insighted_esf7_staging" on ${dbHost}:${dbPort}`,
    );
    _stagingPool = new Pool({
      ...baseConfig,
      max: 5,
      connectionString: connStr,
    });
    _stagingPool.on("error", (err) =>
      console.warn(
        "[Staging Pool Client Error (Auto-recovering)]:",
        err.message,
      ),
    );
  }
  return _stagingPool;
}

// 3. Explicit Production Pool
function getProdPool() {
  if (isLoadTestMode || isLocalHost || isStagingEnv) {
    return getPool();
  }
  if (!_prodPool) {
    const connStr =
      process.env.PROD_DATABASE_URL ||
      process.env.PRODUCTION_DATABASE_URL ||
      (primaryConnUrl
        ? primaryConnUrl.replace(/\/[^/?]+(\?|$)/, `/insighted_esf7$1`)
        : `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/insighted_esf7`);
    console.log(
      `📦 [DB Pool] Production Pool connected -> database: "insighted_esf7" on ${dbHost}:${dbPort}`,
    );
    _prodPool = new Pool({
      ...baseConfig,
      max: 8,
      connectionString: connStr,
    });
    _prodPool.on("error", (err) =>
      console.warn(
        "[Production Pool Client Error (Auto-recovering)]:",
        err.message,
      ),
    );
  }
  return _prodPool;
}

// 4. Centralized insightEd Pool (Read-only master historical data: esf7_database, esf7_database_dummy, unit1_school_identity)
function getInsightEdPool() {
  // On localhost, or if master database name matches defaultDbName,
  // share the primary pool directly so reads and writes are guaranteed to use the local database.
  if (
    isLoadTestMode ||
    isLocalHost ||
    (!process.env.INSIGHTED_DATABASE_URL && masterDbName === defaultDbName)
  ) {
    return getPool();
  }

  if (!_insightEdPool) {
    const connStr =
      process.env.INSIGHTED_DATABASE_URL ||
      (primaryConnUrl
        ? primaryConnUrl.replace(/\/[^/?]+(\?|$)/, `/${masterDbName}$1`)
        : `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${masterDbName}`);
    console.log(
      `📦 [DB Pool] insightEd (Master) Pool connected -> database: "${masterDbName}" on ${dbHost}:${dbPort}`,
    );
    _insightEdPool = new Pool({
      ...baseConfig,
      max: 5,
      connectionString: connStr,
    });
    _insightEdPool.on("error", (err) =>
      console.warn(
        "[insightEd Pool Client Error (Auto-recovering)]:",
        err.message,
      ),
    );
  }
  return _insightEdPool;
}

// 5. Centralized users / auth Pool (Read-only user authentication: user_schoolhead)
function getUsersDbPool() {
  if (!_usersDbPool) {
    const usersDbName =
      process.env.USERS_DB_NAME ||
      process.env.AUTH_DB_NAME ||
      (isLocalHost ? "users_local" : "users_database");
    const connStr =
      process.env.USERS_DATABASE_URL ||
      process.env.AUTH_DATABASE_URL ||
      (primaryConnUrl
        ? primaryConnUrl.replace(/\/[^/?]+(\?|$)/, `/${usersDbName}$1`)
        : `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${usersDbName}`);
    console.log(
      `📦 [DB Pool] Auth/Users Pool connected -> database: "${usersDbName}" on ${dbHost}:${dbPort}`,
    );
    _usersDbPool = new Pool({
      ...baseConfig,
      max: 4,
      connectionString: connStr,
    });
    _usersDbPool.on("error", (err) =>
      console.warn(
        `[${usersDbName} Pool Client Error (Auto-recovering)]:`,
        err.message,
      ),
    );
  }
  return _usersDbPool;
}

// AsyncLocalStorage to maintain request-level database context across asynchronous operations
const dbStorage = new AsyncLocalStorage();

// Lazy reference to division registry if needed
let resolveTestDivision = null;
try {
  const reg = require("../utils/divisionTestRegistry");
  resolveTestDivision = reg.resolveTestDivision;
} catch (e) {}

/**
 * Checks if a school ID belongs to a division test account (900xxx) or dummy/test series
 */
function isDivisionOrTestAccount(schoolId) {
  if (!schoolId) return false;
  const str = String(schoolId).trim();
  const cleanId = str.replace(/^SCH-/i, "").trim();
  const num = parseInt(cleanId, 10);

  if (!isNaN(num)) {
    if (num >= 900001 && num <= 900999) return true;
    if (num >= 800000 && num <= 800100) return true;
    if (num >= 199000 && num <= 199999) return true;
    if (num >= 700000 && num <= 700100) return true;
  }

  const lower = str.toLowerCase();
  if (
    lower.startsWith("divtest-") ||
    lower.startsWith("pilot-") ||
    lower.endsWith(".test") ||
    lower.includes("mcoc.") ||
    lower === "dummy" ||
    lower.startsWith("dummy-") ||
    lower.startsWith("test-") ||
    lower.startsWith("demo-")
  ) {
    return true;
  }

  if (resolveTestDivision && resolveTestDivision(str)) {
    return true;
  }

  return false;
}

/**
 * Returns the appropriate database connection pool based on school ID
 * (Division test accounts / dummy accounts -> stagingPool; Real schools -> prodPool / default pool)
 */
function getPoolForSchool(schoolId) {
  if (isLoadTestMode || isLocalHost || isStagingEnv) {
    return getPool();
  }
  if (isDivisionOrTestAccount(schoolId)) {
    return getStagingPool();
  }
  return process.env.NODE_ENV === "production" ? getProdPool() : getPool();
}

/**
 * Checks if any query parameter or SQL text targets a test account
 */
function containsTestAccountIndicator(text, params) {
  if (isLocalHost || isStagingEnv) return false;
  if (Array.isArray(params)) {
    for (const p of params) {
      if (typeof p === "string" || typeof p === "number") {
        if (isDivisionOrTestAccount(p)) return true;
      }
    }
  }
  if (typeof text === "string") {
    if (
      text.includes("'199999'") ||
      text.includes("'900230'") ||
      text.includes("'900223'") ||
      text.includes("'900224'") ||
      text.includes("'900225'") ||
      text.includes("'900226'") ||
      text.includes("'900227'") ||
      text.includes("'900228'") ||
      text.includes("'900229'")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Express Middleware that detects whether the current request is for a test account,
 * and sets the active DB connection pool in AsyncLocalStorage.
 */
function dbMiddleware(req, res, next) {
  try {
    const { getSchoolIdFromRequest } = require("../utils/auth");
    let schoolId = getSchoolIdFromRequest(req);

    if (!schoolId && req.body) {
      if (req.body.username || req.body.identifier || req.body.email) {
        const iden = req.body.username || req.body.identifier || req.body.email;
        if (isDivisionOrTestAccount(iden)) {
          schoolId = iden;
        }
      }
    }

    const isTest =
      !isLoadTestMode &&
      !isLocalHost &&
      !isStagingEnv &&
      isDivisionOrTestAccount(schoolId);
    const activePool =
      isLoadTestMode || isLocalHost || isStagingEnv
        ? getPool()
        : isTest
          ? getStagingPool()
          : process.env.NODE_ENV === "production"
            ? getProdPool()
            : getPool();

    dbStorage.run({ schoolId, isStaging: isTest, pool: activePool }, () => {
      next();
    });
  } catch (err) {
    next();
  }
}

/**
 * Runs a function within the context of a specific school ID
 */
function runWithSchool(schoolId, callback) {
  const isTest =
    !isLoadTestMode &&
    !isLocalHost &&
    !isStagingEnv &&
    isDivisionOrTestAccount(schoolId);
  const activePool =
    isLoadTestMode || isLocalHost || isStagingEnv
      ? getPool()
      : isTest
        ? getStagingPool()
        : process.env.NODE_ENV === "production"
          ? getProdPool()
          : getPool();
  return dbStorage.run(
    { schoolId, isStaging: isTest, pool: activePool },
    callback,
  );
}

/**
 * Context-aware query function
 */
function query(text, params) {
  const store = dbStorage.getStore();
  if (store && store.pool) {
    return store.pool.query(text, params);
  }

  // Fallback if called outside HTTP request context (e.g. background job, CLI scripts)
  if (isLoadTestMode || isStagingEnv) {
    return getPool().query(text, params);
  }

  if (containsTestAccountIndicator(text, params)) {
    return getStagingPool().query(text, params);
  }

  const defaultActivePool =
    process.env.NODE_ENV === "production" ? getProdPool() : getPool();
  return defaultActivePool.query(text, params);
}

/**
 * Context-aware getClient function
 */
function getClient() {
  const store = dbStorage.getStore();
  if (store && store.pool) {
    return store.pool.connect();
  }
  if (isLoadTestMode || isStagingEnv) {
    return getPool().connect();
  }
  const defaultActivePool =
    process.env.NODE_ENV === "production" ? getProdPool() : getPool();
  return defaultActivePool.connect();
}

function getMasterDbInfo() {
  return {
    masterDbName,
    defaultDbName,
    isShared:
      !process.env.INSIGHTED_DATABASE_URL && masterDbName === defaultDbName,
    host: dbHost,
    port: dbPort,
  };
}

/** Ends every pool that was actually created (shared pools are ended once). Used by graceful shutdown. */
async function closeAllPools() {
  const pools = new Set(
    [_pool, _stagingPool, _prodPool, _insightEdPool, _usersDbPool].filter(
      Boolean,
    ),
  );
  await Promise.all(
    [...pools].map((p) =>
      p.end().catch((e) => console.warn("[Pool close warning]:", e.message)),
    ),
  );
}

const dbExport = {
  query,
  getClient,
  closeAllPools,
  getPool,
  getStagingPool,
  getProdPool,
  getInsightEdPool,
  getUsersDbPool,
  getMasterDbInfo,
  getPoolForSchool,
  isDivisionOrTestAccount,
  dbMiddleware,
  runWithSchool,
  dbStorage,
};

// Lazy getter properties preserve full backwards-compatibility with `db.stagingPool`, `db.prodPool`, etc.
Object.defineProperties(dbExport, {
  pool: { get: getPool, enumerable: true },
  stagingPool: { get: getStagingPool, enumerable: true },
  prodPool: { get: getProdPool, enumerable: true },
  insightEdPool: { get: getInsightEdPool, enumerable: true },
  usersDbPool: { get: getUsersDbPool, enumerable: true },
  usersDatabasePool: { get: getUsersDbPool, enumerable: true },
});

module.exports = dbExport;
