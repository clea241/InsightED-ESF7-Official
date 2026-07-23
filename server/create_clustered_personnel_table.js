const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function createTable() {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS clustered_personnel (
        id SERIAL PRIMARY KEY,
        prn VARCHAR(255) NOT NULL,
        source_school_id VARCHAR(255) NOT NULL,
        target_school_id VARCHAR(255) NOT NULL,
        shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (prn, source_school_id, target_school_id)
      );
    `;
    
    await pool.query(query);
    console.log("Successfully created clustered_personnel table.");
    process.exit(0);
  } catch (err) {
    console.error("Error creating clustered_personnel table:", err);
    process.exit(1);
  }
}

createTable();
