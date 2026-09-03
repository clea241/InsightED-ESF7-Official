const pg = require('pg');
const { Pool } = pg;
const path = require('path');
const fs = require('fs');

const envPaths = [
  path.join(__dirname, '../.env'),
  path.join(__dirname, '../../.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'server/.env')
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
}

// Prevent timezone-shifting of DATE columns by returning raw strings
pg.types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 20000,
  max: 20
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
