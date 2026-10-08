const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// In-memory fallback map in case Redis is momentarily reconnecting
const memoryCache = new Map();
const memoryExpiry = new Map();

let redisClient = null;
let isRedisReady = false;

function initRedis() {
  try {
    const redisOptions = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 500, 2000);
      }
    };

    if (process.env.REDIS_URL) {
      redisClient = new Redis(process.env.REDIS_URL, redisOptions);
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
}, 10000);

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
   * Delete a specific cache key
   */
  async del(key) {
    if (isRedisReady && redisClient) {
      try {
        await redisClient.del(key);
      } catch {}
    }
    memoryCache.delete(key);
    memoryExpiry.delete(key);
  },

  /**
   * Delete all keys matching a prefix or pattern (e.g., 'requests:*')
   */
  async delPattern(pattern) {
    if (isRedisReady && redisClient) {
      try {
        const keys = await redisClient.keys(pattern);
        if (keys && keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch {}
    }

    const cleanRegex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of memoryCache.keys()) {
      if (cleanRegex.test(key)) {
        memoryCache.delete(key);
        memoryExpiry.delete(key);
      }
    }
  }
};

module.exports = cacheService;
