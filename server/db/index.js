const pg = require('pg');
const { Pool } = pg;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Prevent timezone-shifting of DATE columns by returning raw strings
pg.types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 45000,
  query_timeout: 45000,
  max: 30
});

pool.on('error', (err, client) => {
  // Prevent unhandled pool client errors from crashing the process
  console.warn('[Database Pool Client Error (Auto-recovering)]:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};
