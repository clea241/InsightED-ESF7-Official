const path = require("path");
const root = "e:\\InsightED - ESF7 Official";
const { Pool } = require(path.join(root, "node_modules", "pg"));
const STAGING_URL =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7_staging?sslmode=require";

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
