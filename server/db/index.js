const pg = require('pg');
const { Pool } = pg;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Prevent timezone-shifting of DATE columns by returning raw strings
pg.types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('[Database Pool Error]:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
