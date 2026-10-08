/**
 * Standalone Redis Stream Submissions Worker
 * 
 * Usage:
 *   node server/run_redis_worker.js
 * Or with PM2:
 *   pm2 start server/run_redis_worker.js --name insighted-esf7-worker
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const redisQueue = require('./services/redisQueue');
const {
  startRedisStreamWorker,
  processNextJob,
  getCurrentProcessingJobId,
  requeueInFlightJob,
  stopWorker
} = require('./queue_worker');

const CONSUMER_NAME = process.env.REDIS_CONSUMER_NAME || `worker-${process.pid || '1'}`;
let isShuttingDown = false;
let sweepInterval = null;

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
  sweepInterval = setInterval(async () => {
    if (isShuttingDown) return;
    try {
      await processNextJob();
    } catch (e) {}
  }, 20000);

  // Start continuous stream consumption
  startRedisStreamWorker(CONSUMER_NAME).catch(err => {
    if (!isShuttingDown) {
      console.error('❌ Redis stream consumer crashed:', err);
      process.exit(1);
    }
  });

  if (process.send) {
    process.send('ready');
  }
}

async function handleGracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`🛑 [Standalone Worker] ${signal} received. Initiating graceful shutdown...`);

  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }

  if (stopWorker) {
    try { stopWorker(); } catch (e) {}
  }

  const inFlightId = getCurrentProcessingJobId ? getCurrentProcessingJobId() : null;
  if (inFlightId) {
    console.log(`⏳ [Standalone Worker] Waiting for in-flight Job #${inFlightId} to finish before exit...`);
    const deadline = Date.now() + 15000;
    while (getCurrentProcessingJobId && getCurrentProcessingJobId() && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    if (getCurrentProcessingJobId && getCurrentProcessingJobId()) {
      console.warn(`⚠️ [Standalone Worker] In-flight job did not complete within 15s; resetting to 'pending' in PostgreSQL...`);
      if (requeueInFlightJob) {
        await requeueInFlightJob().catch(err => console.error('Failed to requeue on shutdown:', err.message));
      }
    }
  }

  console.log('✅ [Standalone Worker] Shutdown clean. Exiting process.');
  process.exit(0);
}

// Graceful shutdown handling for PM2 and system signals
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

main().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
