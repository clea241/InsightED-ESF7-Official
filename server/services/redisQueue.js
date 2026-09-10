const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const STREAM_KEY = process.env.REDIS_STREAM_KEY || 'esf7:submission_stream';
const GROUP_NAME = process.env.REDIS_GROUP_NAME || 'esf7_submission_group';

let redisClient = null;
let isConnected = false;
let hasLoggedFailure = false;

function getRedisClient() {
  if (redisClient) return redisClient;

  const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy(times) {
      if (times > 5) {
        if (!hasLoggedFailure) {
          console.warn('⚠️ [Redis Queue] Redis offline or unreachable. Operating in PostgreSQL fallback mode.');
          hasLoggedFailure = true;
        }
        return null; // Stop retrying aggressively
      }
      return Math.min(times * 1000, 5000);
    }
  };

  if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL, redisOptions);
  } else {
    redisClient = new Redis(redisOptions);
  }

  redisClient.on('connect', () => {
    isConnected = true;
    hasLoggedFailure = false;
    console.log(`✅ [Redis Queue] Connected to Redis (${redisOptions.host}:${redisOptions.port})`);
  });

  redisClient.on('ready', () => {
    isConnected = true;
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    if (!hasLoggedFailure) {
      console.warn(`⚠️ [Redis Queue] Connection notice: ${err.message}. Fallback mode active.`);
      hasLoggedFailure = true;
    }
  });

  redisClient.on('close', () => {
    isConnected = false;
  });

  return redisClient;
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

    const [streamName, entries] = result[0];
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

module.exports = {
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
