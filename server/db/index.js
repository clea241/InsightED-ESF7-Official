const pg = require('pg');
const { Pool } = pg;
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Prevent timezone-shifting of DATE columns by returning raw strings
pg.types.setTypeParser(1082, (val) => val);

const defaultDbName = process.env.DB_NAME || 'insighted_esf7';
const dbHost = process.env.DB_HOST || 'stride-posgre-prod-01.postgres.database.azure.com';
const dbUser = process.env.DB_USER || 'Administrator1';
const dbPassword = process.env.DB_PASSWORD || 'pRZTbQ2T1JD7';
const dbPort = process.env.DB_PORT || '5432';
const isLocalHost = dbHost === '127.0.0.1' || dbHost === 'localhost';
const dbSsl = (!isLocalHost && (process.env.DB_SSL === 'true' || dbHost.includes('azure.com'))) 
  ? { rejectUnauthorized: false } 
  : (process.env.DB_SSL === 'true' && !isLocalHost ? { rejectUnauthorized: false } : false);

// Base configuration with bounded connection timeout and quick idle recovery
const baseConfig = {
  ssl: dbSsl,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  idleTimeoutMillis: 10000,        // Reclaim idle connections after 10s
  connectionTimeoutMillis: 15000   // Fail fast at 15s instead of hanging indefinitely
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
    const connStr = process.env.DATABASE_URL || `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${defaultDbName}`;
    console.log(`📦 [DB Pool] Primary Pool connected -> database: "${defaultDbName}" on ${dbHost}:${dbPort}`);
    _pool = new Pool({
      ...baseConfig,
      max: 8,
      connectionString: connStr
    });
    _pool.on('error', (err) => console.warn('[Database Pool Client Error (Auto-recovering)]:', err.message));
  }
  return _pool;
}

// 2. Explicit Staging Pool (for division test accounts & staging QA)
function getStagingPool() {
  if (!_stagingPool) {
    console.log(`📦 [DB Pool] Staging Pool connected -> database: "insighted_esf7_staging" on ${dbHost}:${dbPort}`);
    _stagingPool = new Pool({
      ...baseConfig,
      max: 5,
      connectionString: `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/insighted_esf7_staging`
    });
    _stagingPool.on('error', (err) => console.warn('[Staging Pool Client Error (Auto-recovering)]:', err.message));
  }
  return _stagingPool;
}

// 3. Explicit Production Pool
function getProdPool() {
  if (!_prodPool) {
    console.log(`📦 [DB Pool] Production Pool connected -> database: "insighted_esf7" on ${dbHost}:${dbPort}`);
    _prodPool = new Pool({
      ...baseConfig,
      max: 8,
      connectionString: `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/insighted_esf7`
    });
    _prodPool.on('error', (err) => console.warn('[Production Pool Client Error (Auto-recovering)]:', err.message));
  }
  return _prodPool;
}

// 4. Centralized insightEd Pool (Read-only master historical data: esf7_database, esf7_database_dummy, unit1_school_identity)
function getInsightEdPool() {
  if (!_insightEdPool) {
    console.log(`📦 [DB Pool] insightEd (Master) Pool connected -> database: "insightEd" on ${dbHost}:${dbPort}`);
    _insightEdPool = new Pool({
      ...baseConfig,
      max: 5,
      connectionString: process.env.DATABASE_URL
        ? process.env.DATABASE_URL.replace(/insighted_esf7(_staging)?/, 'insightEd')
        : `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/insightEd`
    });
    _insightEdPool.on('error', (err) => console.warn('[insightEd Pool Client Error (Auto-recovering)]:', err.message));
  }
  return _insightEdPool;
}

// 5. Centralized users / auth Pool (Read-only user authentication: user_schoolhead)
function getUsersDbPool() {
  if (!_usersDbPool) {
    const usersDbName = process.env.USERS_DB_NAME || process.env.AUTH_DB_NAME || (isLocalHost ? 'users_local' : 'users_database');
    console.log(`📦 [DB Pool] Auth/Users Pool connected -> database: "${usersDbName}" on ${dbHost}:${dbPort}`);
    _usersDbPool = new Pool({
      ...baseConfig,
      max: 4,
      connectionString: process.env.USERS_DATABASE_URL || (process.env.DATABASE_URL
        ? process.env.DATABASE_URL.replace(/insighted_esf7(_staging)?/, usersDbName)
        : `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${usersDbName}`)
    });
    _usersDbPool.on('error', (err) => console.warn(`[${usersDbName} Pool Client Error (Auto-recovering)]:`, err.message));
  }
  return _usersDbPool;
}

// AsyncLocalStorage to maintain request-level database context across asynchronous operations
const dbStorage = new AsyncLocalStorage();

// Lazy reference to division registry if needed
let resolveTestDivision = null;
try {
  const reg = require('../utils/divisionTestRegistry');
  resolveTestDivision = reg.resolveTestDivision;
} catch (e) {}

/**
 * Checks if a school ID belongs to a division test account (900xxx) or dummy/test series
 */
function isDivisionOrTestAccount(schoolId) {
  if (!schoolId) return false;
  const str = String(schoolId).trim();
  const cleanId = str.replace(/^SCH-/i, '').trim();
  const num = parseInt(cleanId, 10);
  
  if (!isNaN(num)) {
    if (num >= 900001 && num <= 900999) return true;
    if (num >= 800000 && num <= 800100) return true;
    if (num >= 199000 && num <= 199999) return true;
    if (num >= 700000 && num <= 700100) return true;
  }
  
  const lower = str.toLowerCase();
  if (
    lower.startsWith('divtest-') ||
    lower.startsWith('pilot-') ||
    lower.endsWith('.test') ||
    lower.includes('mcoc.') ||
    lower === 'dummy' ||
    lower.startsWith('dummy-') ||
    lower.startsWith('test-') ||
    lower.startsWith('demo-')
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
  if (isDivisionOrTestAccount(schoolId)) {
    return getStagingPool();
  }
  return process.env.NODE_ENV === 'production' ? getProdPool() : getPool();
}

/**
 * Checks if any query parameter or SQL text targets a test account
 */
function containsTestAccountIndicator(text, params) {
  if (Array.isArray(params)) {
    for (const p of params) {
      if (typeof p === 'string' || typeof p === 'number') {
        if (isDivisionOrTestAccount(p)) return true;
      }
    }
  }
  if (typeof text === 'string') {
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
    const { getSchoolIdFromRequest } = require('../utils/auth');
    let schoolId = getSchoolIdFromRequest(req);

    if (!schoolId && req.body) {
      if (req.body.username || req.body.identifier || req.body.email) {
        const iden = req.body.username || req.body.identifier || req.body.email;
        if (isDivisionOrTestAccount(iden)) {
          schoolId = iden;
        }
      }
    }

    const isTest = isDivisionOrTestAccount(schoolId);
    const activePool = isTest ? getStagingPool() : (process.env.NODE_ENV === 'production' ? getProdPool() : getPool());

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
  const isTest = isDivisionOrTestAccount(schoolId);
  const activePool = isTest ? getStagingPool() : (process.env.NODE_ENV === 'production' ? getProdPool() : getPool());
  return dbStorage.run({ schoolId, isStaging: isTest, pool: activePool }, callback);
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
  if (containsTestAccountIndicator(text, params)) {
    return getStagingPool().query(text, params);
  }

  const defaultActivePool = process.env.NODE_ENV === 'production' ? getProdPool() : getPool();
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
  const defaultActivePool = process.env.NODE_ENV === 'production' ? getProdPool() : getPool();
  return defaultActivePool.connect();
}

const dbExport = {
  query,
  getClient,
  getPool,
  getStagingPool,
  getProdPool,
  getInsightEdPool,
  getUsersDbPool,
  getPoolForSchool,
  isDivisionOrTestAccount,
  dbMiddleware,
  runWithSchool,
  dbStorage
};

// Lazy getter properties preserve full backwards-compatibility with `db.stagingPool`, `db.prodPool`, etc.
Object.defineProperties(dbExport, {
  pool: { get: getPool, enumerable: true },
  stagingPool: { get: getStagingPool, enumerable: true },
  prodPool: { get: getProdPool, enumerable: true },
  insightEdPool: { get: getInsightEdPool, enumerable: true },
  usersDbPool: { get: getUsersDbPool, enumerable: true },
  usersDatabasePool: { get: getUsersDbPool, enumerable: true }
});

module.exports = dbExport;
