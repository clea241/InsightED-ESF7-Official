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

const baseConfig = {
  ssl: dbSsl,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  max: 30
};

// 1. Primary Pool (env configured)
const pool = new Pool({
  ...baseConfig,
  connectionString: process.env.DATABASE_URL || `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${defaultDbName}`
});

// 2. Explicit Staging Pool (for division test accounts & staging QA)
const stagingPool = new Pool({
  ...baseConfig,
  connectionString: `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/insighted_esf7_staging`
});

// 3. Explicit Production Pool
const prodPool = new Pool({
  ...baseConfig,
  connectionString: `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/insighted_esf7`
});

// 4. Centralized insightEd Pool (Read-only master historical data: esf7_database, esf7_database_dummy, unit1_school_identity)
const insightEdPool = new Pool({
  ...baseConfig,
  connectionString: process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/insighted_esf7(_staging)?/, 'insightEd')
    : `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/insightEd`
});

// 5. Centralized users_database Pool (Read-only user authentication: user_schoolhead)
const usersDbPool = new Pool({
  ...baseConfig,
  connectionString: process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/insighted_esf7(_staging)?/, 'users_database')
    : `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/users_database`
});

pool.on('error', (err) => console.warn('[Database Pool Client Error (Auto-recovering)]:', err.message));
stagingPool.on('error', (err) => console.warn('[Staging Pool Client Error (Auto-recovering)]:', err.message));
prodPool.on('error', (err) => console.warn('[Production Pool Client Error (Auto-recovering)]:', err.message));
insightEdPool.on('error', (err) => console.warn('[insightEd Pool Client Error (Auto-recovering)]:', err.message));
usersDbPool.on('error', (err) => console.warn('[users_database Pool Client Error (Auto-recovering)]:', err.message));

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
    return stagingPool;
  }
  return process.env.NODE_ENV === 'production' ? prodPool : pool;
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
    const activePool = isTest ? stagingPool : (process.env.NODE_ENV === 'production' ? prodPool : pool);

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
  const activePool = isTest ? stagingPool : (process.env.NODE_ENV === 'production' ? prodPool : pool);
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
    return stagingPool.query(text, params);
  }

  const defaultActivePool = process.env.NODE_ENV === 'production' ? prodPool : pool;
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
  const defaultActivePool = process.env.NODE_ENV === 'production' ? prodPool : pool;
  return defaultActivePool.connect();
}

module.exports = {
  query,
  getClient,
  pool,
  stagingPool,
  prodPool,
  insightEdPool,
  usersDbPool,
  usersDatabasePool: usersDbPool,
  getPoolForSchool,
  isDivisionOrTestAccount,
  dbMiddleware,
  runWithSchool,
  dbStorage
};

