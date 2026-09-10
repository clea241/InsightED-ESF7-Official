/**
 * Standalone Redis Stream Submissions Worker
 * 
 * Usage:
 *   node server/run_redis_worker.js
 * Or with PM2:
 *   pm2 start server/run_redis_worker.js -i 2 --name esf7-redis-worker
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const redisQueue = require('./services/redisQueue');
const { startRedisStreamWorker, processNextJob } = require('./queue_worker');

const CONSUMER_NAME = process.env.REDIS_CONSUMER_NAME || `worker-${process.pid || '1'}`;

async function main() {
  console.log('====================================================');
  console.log('  🌊 InsightED ESF7 Standalone Redis Stream Worker  ');
  console.log('====================================================');
  console.log(`• Consumer ID: ${CONSUMER_NAME}`);
  console.log(`• Stream Key:  ${redisQueue.STREAM_KEY}`);
  console.log(`• Group Name:  ${redisQueue.GROUP_NAME}`);
  console.log('----------------------------------------------------');

  const initialized = await redisQueue.initRedisStream();
  if (!initialized) {
    console.warn('⚠️ Could not connect to Redis Stream. Will retry connecting in background and fallback to DB sweep...');
  }

  // Safety net: sweep PostgreSQL queue every 20 seconds for any stranded or offline jobs
  setInterval(async () => {
    try {
      await processNextJob();
    } catch (e) {}
  }, 20000);

  // Start continuous stream consumption
  startRedisStreamWorker(CONSUMER_NAME).catch(err => {
    console.error('❌ Redis stream consumer crashed:', err);
    process.exit(1);
  });
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down worker gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down worker gracefully...');
  process.exit(0);
});

main().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
