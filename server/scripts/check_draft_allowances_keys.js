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
    const q = await client.query(`
      SELECT 
        count(*) FILTER (WHERE payload->'allowancesMap' IS NOT NULL) as with_allowancesMap,
        count(*) FILTER (WHERE payload->'allowances' IS NOT NULL) as with_allowances,
        count(*) FILTER (WHERE payload->'personnelAllowances' IS NOT NULL) as with_personnelAllowances,
        count(*) FILTER (WHERE payload ? 'allowancesMap') as has_key_allowancesMap,
        count(*) FILTER (WHERE payload ? 'allowances') as has_key_allowances
      FROM school_drafts;
    `);
    console.log('Draft keys counts:', q.rows[0]);

    // Let's also check sample of school_drafts with allowancesMap or allowances
    const sample = await client.query(`
      SELECT school_id, payload->'allowancesMap' as allowances_map, payload->'allowances' as allowances
      FROM school_drafts
      WHERE payload->'allowancesMap' IS NOT NULL OR payload->'allowances' IS NOT NULL
      LIMIT 2;
    `);
    console.log('Sample draft allowances:');
    for (const r of sample.rows) {
      console.log(`School ${r.school_id}:`, JSON.stringify(r.allowances_map || r.allowances).slice(0, 300));
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
