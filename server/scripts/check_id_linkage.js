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
    console.log('--- Current ID-to-ID matches ---');
    const directReg = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_regular_sections r ON w.section_id = r.id;
    `);
    console.log('Direct ID match with regular_sections:', directReg.rows[0].count);

    const directAls = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_als_sections a ON w.section_id = a.id;
    `);
    console.log('Direct ID match with als_sections:', directAls.rows[0].count);

    const directAral = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_aral_sections ar ON w.section_id = ar.id;
    `);
    console.log('Direct ID match with aral_sections:', directAral.rows[0].count);

    const directSned = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_sned_sections s ON w.section_id = s.id;
    `);
    console.log('Direct ID match with sned_sections:', directSned.rows[0].count);

    console.log('\n--- Checking non-matching workloads ---');
    const unmatchedSample = await client.query(`
      SELECT w.id, w.school_id, w.section_id, w.section_name, w.grade_level, w.subject
      FROM esf7_workload_rows w
      WHERE w.section_id IS NOT NULL 
        AND NOT EXISTS (SELECT 1 FROM esf7_regular_sections r WHERE r.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_als_sections a WHERE a.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_aral_sections ar WHERE ar.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_sned_sections s WHERE s.id = w.section_id)
      LIMIT 15;
    `);
    console.log('Sample unmatched workload rows:');
    console.log(unmatchedSample.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
