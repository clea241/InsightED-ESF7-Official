const { Pool } = require('../node_modules/pg');

const pool = new Pool({
  host: 'stride-posgre-prod-01.postgres.database.azure.com',
  port: 5432,
  user: 'Administrator1',
  password: 'pRZTbQ2T1JD7',
  database: 'insighted_esf7',
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    const tables = ['esf7_regular_sections', 'esf7_als_sections', 'esf7_aral_sections', 'esf7_sned_sections', 'esf7_workload_rows'];
    for (const table of tables) {
      console.log(`\n=== Table: ${table} ===`);
      const cols = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      console.log(cols.rows);

      const sample = await client.query(`
        SELECT id, school_id, section_name
        FROM ${table}
        LIMIT 3;
      `);
      console.log('Sample rows:', sample.rows);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
