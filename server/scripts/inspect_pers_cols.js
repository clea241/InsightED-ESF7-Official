require("../db/directPort");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const path = require("path");
const { Pool } = require("pg");

const dbUser = process.env.DB_USER || "Administrator1";
const dbPass = process.env.DB_PASSWORD || process.env.AZURE_PG_PASSWORD || "";
const dbHost =
  process.env.DB_HOST || "stride-posgre-prod-01.postgres.database.azure.com";
const dbPort = process.env.DB_DIRECT_PORT || 5432;

const STAGING_URL =
  process.env.STAGING_DATABASE_URL ||
  `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/insighted_esf7_staging?sslmode=require`;

async function inspect() {
  const pool = new Pool({ connectionString: STAGING_URL });
  const res = await pool.query(`
    SELECT ordinal_position, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_name = 'esf7_personnel_profile'
    ORDER BY ordinal_position
  `);
  console.table(res.rows);
  await pool.end();
}
inspect().catch(console.error);
