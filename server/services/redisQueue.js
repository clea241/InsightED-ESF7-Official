const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const STREAM_KEY = process.env.REDIS_STREAM_KEY || 'esf7:submission_stream';
const GROUP_NAME = process.env.REDIS_GROUP_NAME || 'esf7_submission_group';

const { parseRedisConfig } = require('../utils/redisConfig');

let redisClient = null;
let isConnected = false;

// Queue mode bookkeeping. "redis" = stream consumers are active; "postgres-fallback" = jobs are processed
// straight from the esf7_submission_queue table. The reason is logged ONCE per outage, not on every retry.
let queueMode = 'postgres-fallback';
let modeSince = new Date().toISOString();
let lastError = 'Redis connection not established yet';
let outageLogged = false;
let configDisplay = null;
const modeListeners = new Set();

function setMode(next, reason) {
  if (next === queueMode) {
    if (next === 'postgres-fallback') {
      if (reason) lastError = reason;
      // First failure since startup (we begin in fallback mode): log the reason once.
      if (!outageLogged && reason) {
        console.warn(`⚠️ [Redis Queue] Using POSTGRES-FALLBACK mode (${configDisplay}): ${lastError}. Reconnecting automatically in the background.`);
        outageLogged = true;
      }
    }
    return;
  }
  queueMode = next;
  modeSince = new Date().toISOString();
  if (next === 'redis') {
    lastError = null;
    outageLogged = false;
    console.log(`✅ [Redis Queue] Back in REDIS mode (${configDisplay}). Pending stream entries and queued PostgreSQL rows will be drained.`);
  } else {
    lastError = reason || lastError;
    if (!outageLogged) {
      console.warn(`⚠️ [Redis Queue] Switched to POSTGRES-FALLBACK mode (${configDisplay}): ${lastError}. Reconnecting automatically in the background.`);
      outageLogged = true;
    }
  }
  modeListeners.forEach((fn) => { try { fn(queueMode); } catch (e) { console.error('[Redis Queue] mode listener failed:', e.message); } });
}

function getRedisClient() {
  if (redisClient) return redisClient;

  // Throws RedisConfigError with a clear message if REDIS_URL / REDIS_HOST / REDIS_PORT is malformed.
  const cfg = parseRedisConfig();
  configDisplay = cfg.display;

  const redisOptions = {
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    // Never give up: keep trying with a capped backoff so the app returns to Redis mode by itself.
    retryStrategy(times) {
      return Math.min(times * 1000, 15000);
    }
  };

  redisClient = cfg.url ? new Redis(cfg.url, redisOptions) : new Redis(redisOptions);

  redisClient.on('ready', () => {
    isConnected = true;
    setMode('redis');
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    setMode('postgres-fallback', err.message);
  });

  redisClient.on('close', () => {
    isConnected = false;
    setMode('postgres-fallback', 'connection closed');
  });

  return redisClient;
}

// Start connecting (idempotent). Called at server/worker startup so mode and health are accurate immediately.
function startMonitor() {
  try {
    const client = getRedisClient();
    if (client.status === 'wait') {
      client.connect().catch(() => { /* reported via the 'error' event */ });
    }
  } catch (err) {
    // Malformed configuration must be loud, not silently ignored.
    console.error(`❌ [Redis Queue] Invalid Redis configuration: ${err.message}`);
    throw err;
  }
}

function getQueueStatus() {
  return {
    mode: queueMode,
    redisReachable: queueMode === 'redis',
    since: modeSince,
    lastError: queueMode === 'redis' ? null : lastError,
    target: configDisplay
  };
}

function onModeChange(fn) {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}

/**
 * Check if Redis is reachable
 */
async function checkRedisHealth() {
  try {
    const client = getRedisClient();
    if (client.status === 'wait') {
      await client.connect();
    }
    await client.ping();
    isConnected = true;
    return true;
  } catch (err) {
    if (err && err.name === 'RedisConfigError') throw err;
    isConnected = false;
    return false;
  }
}

/**
 * Initialize Stream and Consumer Group idempotently
 */
async function initRedisStream() {
  try {
    const isHealthy = await checkRedisHealth();
    if (!isHealthy) return false;

    const client = getRedisClient();
    try {
      // Create consumer group with MKSTREAM so stream is created if it doesn't exist
      await client.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '$', 'MKSTREAM');
      console.log(`✅ [Redis Queue] Created consumer group '${GROUP_NAME}' on stream '${STREAM_KEY}'`);
    } catch (err) {
      if (err.message.includes('BUSYGROUP')) {
        // Consumer group already exists - perfectly normal
      } else {
        throw err;
      }
    }
    return true;
  } catch (err) {
    console.warn('[Redis Queue Init Notice]:', err.message);
    return false;
  }
}

/**
 * Publish a submission job pointer to Redis Stream
 */
async function publishSubmissionJob({ jobId, schoolId, schoolYear }) {
  try {
    const isHealthy = await checkRedisHealth();
    if (!isHealthy) {
      // Fallback: job is already stored as 'pending' in PostgreSQL esf7_submission_queue
      return { success: false, mode: 'postgres_fallback', error: 'Redis offline' };
    }

    const client = getRedisClient();
    const entryId = await client.xadd(
      STREAM_KEY,
      '*',
      'jobId', String(jobId),
      'schoolId', String(schoolId),
      'schoolYear', String(schoolYear || '2026-2027'),
      'queuedAt', new Date().toISOString()
    );

    return { success: true, mode: 'redis_stream', entryId };
  } catch (err) {
    console.warn(`⚠️ [Redis Queue Publish Warn]: ${err.message} (Job ${jobId} retained in PostgreSQL queue)`);
    return { success: false, mode: 'postgres_fallback', error: err.message };
  }
}

/**
 * Read next job from Redis Stream via Consumer Group
 */
async function readNextStreamJob({ consumerName = 'worker-1', blockMs = 2000, count = 1 }) {
  try {
    const isHealthy = await checkRedisHealth();
    if (!isHealthy) return null;

    const client = getRedisClient();
    // XREADGROUP GROUP <group> <consumer> BLOCK <ms> COUNT <count> STREAMS <stream> >
    const result = await client.xreadgroup(
      'GROUP', GROUP_NAME, consumerName,
      'BLOCK', blockMs,
      'COUNT', count,
      'STREAMS', STREAM_KEY, '>'
    );

    if (!result || result.length === 0) return null;

    const [, entries] = result[0];
    if (!entries || entries.length === 0) return null;

    const [entryId, fieldsArray] = entries[0];
    const fields = {};
    for (let i = 0; i < fieldsArray.length; i += 2) {
      fields[fieldsArray[i]] = fieldsArray[i + 1];
    }

    return {
      messageId: entryId,
      jobId: parseInt(fields.jobId, 10),
      schoolId: fields.schoolId,
      schoolYear: fields.schoolYear,
      queuedAt: fields.queuedAt
    };
  } catch (err) {
    if (!err.message.includes('NOGROUP')) {
      console.warn('[Redis Queue Read Warn]:', err.message);
    }
    return null;
  }
}

/**
 * Acknowledge processed stream entry
 */
async function ackJob(messageId) {
  try {
    const client = getRedisClient();
    await client.xack(STREAM_KEY, GROUP_NAME, messageId);
    return true;
  } catch (err) {
    console.warn(`[Redis Queue ACK Warn for ${messageId}]:`, err.message);
    return false;
  }
}

/**
 * Auto-claim stalled/abandoned jobs from dead or crashed workers
 */
async function claimStalledJobs({ consumerName = 'worker-1', minIdleTimeMs = 120000, count = 1 }) {
  try {
    const isHealthy = await checkRedisHealth();
    if (!isHealthy) return [];

    const client = getRedisClient();
    // XAUTOCLAIM <stream> <group> <consumer> <min-idle-time> <start-id> COUNT <count>
    const result = await client.xautoclaim(
      STREAM_KEY, GROUP_NAME, consumerName,
      minIdleTimeMs, '0-0',
      'COUNT', count
    );

    if (!result || !Array.isArray(result[1]) || result[1].length === 0) {
      return [];
    }

    const claimedEntries = result[1];
    return claimedEntries.map(([entryId, fieldsArray]) => {
      const fields = {};
      for (let i = 0; i < fieldsArray.length; i += 2) {
        fields[fieldsArray[i]] = fieldsArray[i + 1];
      }
      return {
        messageId: entryId,
        jobId: parseInt(fields.jobId, 10),
        schoolId: fields.schoolId,
        schoolYear: fields.schoolYear,
        queuedAt: fields.queuedAt,
        isClaimed: true
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Inspect and claim ALL idle pending (delivered but never acknowledged) stream entries: XPENDING for the log,
 * XAUTOCLAIM in batches for the work. Used at startup and every time the queue switches back to Redis.
 * Entries stay pending until the caller acknowledges them after the database commit.
 */
async function drainPendingEntries({ consumerName = 'worker-1', minIdleTimeMs = 30000, batch = 50, maxBatches = 40 } = {}) {
  const claimed = [];
  try {
    const isHealthy = await checkRedisHealth();
    if (!isHealthy) return claimed;
    const client = getRedisClient();

    try {
      const summary = await client.xpending(STREAM_KEY, GROUP_NAME);
      if (summary && Number(summary[0]) > 0) {
        console.log(`🔎 [Redis Queue] XPENDING: ${summary[0]} unacknowledged entr${Number(summary[0]) === 1 ? 'y' : 'ies'} (oldest ${summary[1]}, newest ${summary[2]}).`);
      }
    } catch (e) { /* NOGROUP etc.: nothing pending */ }

    let cursor = '0-0';
    for (let n = 0; n < maxBatches; n++) {
      const result = await client.xautoclaim(STREAM_KEY, GROUP_NAME, consumerName, minIdleTimeMs, cursor, 'COUNT', batch);
      if (!result) break;
      const entries = Array.isArray(result[1]) ? result[1] : [];
      for (const [entryId, fieldsArray] of entries) {
        const fields = {};
        for (let k = 0; k < fieldsArray.length; k += 2) fields[fieldsArray[k]] = fieldsArray[k + 1];
        claimed.push({ messageId: entryId, jobId: parseInt(fields.jobId, 10), schoolId: fields.schoolId, schoolYear: fields.schoolYear, queuedAt: fields.queuedAt, isClaimed: true });
      }
      cursor = result[0];
      if (!cursor || cursor === '0-0') break;
    }
  } catch (err) {
    if (err && err.name === 'RedisConfigError') throw err;
    console.warn('[Redis Queue] drainPendingEntries notice:', err.message);
  }
  return claimed;
}

module.exports = {
  startMonitor,
  getQueueStatus,
  onModeChange,
  drainPendingEntries,
  STREAM_KEY,
  GROUP_NAME,
  getRedisClient,
  checkRedisHealth,
  initRedisStream,
  publishSubmissionJob,
  readNextStreamJob,
  ackJob,
  claimStalledJobs,
  isRedisAvailable: () => isConnected
};
