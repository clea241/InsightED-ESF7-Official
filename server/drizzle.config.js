const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  dialect: 'postgresql',
  schema: './drizzle/schema.ts',
  out: './drizzle',
  dbCredentials: {
    host: process.env.DB_HOST || 'stride-posgre-prod-01.postgres.database.azure.com',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'Administrator1',
    password: process.env.DB_PASSWORD || 'pRZTbQ2T1JD7',
    database: process.env.DB_NAME || 'insighted_esf7',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  }
};
