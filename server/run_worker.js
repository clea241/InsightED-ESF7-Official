/**
 * Stand-alone Submissions Queue Worker Service
 * Designed to be executed as a background daemon (e.g. systemd, PM2, or VM worker process)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { startWorker } = require('./queue_worker');

console.log('================================================================');
console.log('🤖 InsightED ESF7 Submissions Queue Worker Starting...');
console.log(`🕒 Process ID (PID): ${process.pid}`);
console.log(`🌍 Target Database: ${process.env.DB_HOST} / ${process.env.DB_NAME}`);
console.log('================================================================');

// Global handlers for stability in VMs
process.on('uncaughtException', (err) => {
  console.error('💥 Critical Uncaught Exception:', err.message);
  console.error(err.stack);
  // Keep process alive but alert; VM managers (like PM2 or systemd) will auto-restart if exited,
  // but we log here to keep diagnostic trace
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start worker polling cycle
startWorker();

// Graceful shutdown handling
const gracefulShutdown = () => {
  console.log('\n🛑 Shutdown signal received. Stopping worker queue processor...');
  // Add any database client release/end connections if needed
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
