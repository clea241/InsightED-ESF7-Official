const Redis = require('ioredis');
const { parseRedisConfig } = require('../utils/redisConfig');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// In-memory fallback map in case Redis is momentarily reconnecting
const memoryCache = new Map();
const memoryExpiry = new Map();

const CACHE_INVALIDATION_CHANNEL = 'esf7:cache_invalidation';

let redisClient = null;
let subClient = null;
let isRedisReady = false;

function clearLocalMemoryKey(key) {
  memoryCache.delete(key);
  memoryExpiry.delete(key);
}

function clearLocalMemoryPattern(pattern) {
  const cleanRegex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const key of memoryCache.keys()) {
    if (cleanRegex.test(key)) {
      memoryCache.delete(key);
      memoryExpiry.delete(key);
    }
  }
}

function initRedis() {
  // Validated outside the try/catch on purpose: a malformed REDIS_* value must be loud, not swallowed.
  const cfg = parseRedisConfig();
  try {
    const redisOptions = {
      host: cfg.host,
      port: cfg.port,
      password: cfg.password,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 500, 2000);
      }
    };

    if (cfg.url) {
      redisClient = new Redis(cfg.url, redisOptions);
    } else {
      redisClient = new Redis(redisOptions);
    }

    redisClient.on('connect', () => {
      isRedisReady = true;
      console.log('⚡ [CacheService] Connected to Redis Cache Engine.');
    });

    redisClient.on('ready', () => {
      isRedisReady = true;
    });

    redisClient.on('error', () => {
      isRedisReady = false;
    });

    redisClient.on('close', () => {
      isRedisReady = false;
    });

    redisClient.connect().catch(() => {
      isRedisReady = false;
    });

    // Subscriber client for inter-worker cache invalidation broadcasts
    const subOptions = { ...redisOptions, maxRetriesPerRequest: null };
    subClient = cfg.url ? new Redis(cfg.url, subOptions) : new Redis(subOptions);

    subClient.on('ready', () => {
      subClient.subscribe(CACHE_INVALIDATION_CHANNEL).catch(() => {});
    });

    subClient.on('message', (channel, message) => {
      if (channel === CACHE_INVALIDATION_CHANNEL) {
        try {
          const data = JSON.parse(message);
          if (data.action === 'del' && data.key) {
            clearLocalMemoryKey(data.key);
          } else if (data.action === 'delPattern' && data.pattern) {
            clearLocalMemoryPattern(data.pattern);
          }
        } catch {}
      }
    });

    subClient.on('error', () => {});
    subClient.connect().catch(() => {});
  } catch {
    isRedisReady = false;
  }
}

initRedis();

// Periodic self-cleanup for in-memory fallback
setInterval(() => {
  const now = Date.now();
  for (const [key, exp] of memoryExpiry.entries()) {
    if (exp <= now) {
      memoryCache.delete(key);
      memoryExpiry.delete(key);
    }
  }
}, 10000).unref(); // unref: housekeeping must not keep the process (or tests) alive

const cacheService = {
  /**
   * Get cached JSON object by key
   */
  async get(key) {
    if (isRedisReady && redisClient) {
      try {
        const val = await redisClient.get(key);
        if (val) return JSON.parse(val);
      } catch {
        // Fall back to memoryCache on error
      }
    }

    const exp = memoryExpiry.get(key);
    if (exp && exp > Date.now()) {
      return memoryCache.get(key);
    }
    return null;
  },

  /**
   * Set cached JSON object with TTL in seconds
   */
  async set(key, value, ttlSeconds = 5) {
    const serialized = JSON.stringify(value);

    if (isRedisReady && redisClient) {
      try {
        await redisClient.set(key, serialized, 'EX', ttlSeconds);
      } catch {
        // Fallback to memoryCache
      }
    }

    memoryCache.set(key, value);
    memoryExpiry.set(key, Date.now() + (ttlSeconds * 1000));
  },

  /**
   * Delete a specific cache key and broadcast invalidation to all workers
   */
  async del(key) {
    if (isRedisReady && redisClient) {
      try {
        await redisClient.del(key);
        redisClient.publish(
          CACHE_INVALIDATION_CHANNEL,
          JSON.stringify({ action: 'del', key })
        ).catch(() => {});
      } catch {}
    }
    clearLocalMemoryKey(key);
  },

  /**
   * Delete all keys matching a prefix or pattern using non-blocking SCAN iteration,
   * and broadcast invalidation to all workers to clear their in-memory Map fallback.
   */
  async delPattern(pattern) {
    if (isRedisReady && redisClient) {
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = nextCursor;
          if (keys && keys.length > 0) {
            await redisClient.del(...keys);
          }
        } while (cursor !== '0');

        redisClient.publish(
          CACHE_INVALIDATION_CHANNEL,
          JSON.stringify({ action: 'delPattern', pattern })
        ).catch(() => {});
      } catch {}
    }

    clearLocalMemoryPattern(pattern);
  },

  // Exported for testing / debugging
  _getMemoryCache: () => memoryCache,
  _getMemoryExpiry: () => memoryExpiry,
  _clearLocalMemory: () => { memoryCache.clear(); memoryExpiry.clear(); }
};

module.exports = cacheService;
