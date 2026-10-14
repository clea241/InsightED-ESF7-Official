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
    const draftRes = await client.query(`
      SELECT school_id, 
        payload->'sections' as sections,
        payload->'alsSections' as als,
        payload->'aralSections' as aral,
        payload->'snedSections' as sned,
        payload->'workload' as workload,
        payload->'teachers' as teachers
      FROM school_drafts
      WHERE payload->'sections' IS NOT NULL 
        AND jsonb_array_length(payload->'sections') > 0
      LIMIT 2;
    `);

    for (const row of draftRes.rows) {
      console.log(`\n=== Draft for School ${row.school_id} ===`);
      console.log('Regular sections count:', row.sections?.length);
      console.log('Sample section:', row.sections?.slice(0, 3));
      console.log('ALS count:', row.als?.length);
      console.log('ARAL count:', row.aral?.length);
      console.log('SNED count:', row.sned?.length);
      
      // Look at workload in teachers
      if (Array.isArray(row.teachers)) {
        for (const t of row.teachers) {
          const wkl = t.workload || t.workloadRows || t.schedule;
          if (Array.isArray(wkl) && wkl.length > 0) {
            console.log(`Teacher ${t.id || t.name} workloads (first 3):`, wkl.slice(0, 3));
            break;
          }
        }
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
