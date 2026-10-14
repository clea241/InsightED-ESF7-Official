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
    const res = await client.query(`
      SELECT w.school_id, count(w.id) as wkl_count
      FROM esf7_workload_rows w
      GROUP BY w.school_id
      LIMIT 5;
    `);
    console.log('Sample schools with workloads:', res.rows);

    for (const r of res.rows) {
      const reg = await client.query('SELECT count(*) FROM esf7_regular_sections WHERE school_id = $1', [r.school_id]);
      const als = await client.query('SELECT count(*) FROM esf7_als_sections WHERE school_id = $1', [r.school_id]);
      const aral = await client.query('SELECT count(*) FROM esf7_aral_sections WHERE school_id = $1', [r.school_id]);
      const sned = await client.query('SELECT count(*) FROM esf7_sned_sections WHERE school_id = $1', [r.school_id]);
      console.log(`School ${r.school_id}: workloads=${r.wkl_count}, regular_sec=${reg.rows[0].count}, als=${als.rows[0].count}, aral=${aral.rows[0].count}, sned=${sned.rows[0].count}`);
    }

    // Now let's pick a school that has both workloads and sections
    const commonSchool = await client.query(`
      SELECT w.school_id, count(DISTINCT w.id) as wkl_count, count(DISTINCT s.id) as sec_count
      FROM esf7_workload_rows w
      JOIN esf7_regular_sections s ON w.school_id = s.school_id
      GROUP BY w.school_id
      ORDER BY wkl_count DESC
      LIMIT 3;
    `);
    console.log('\nSchools with both workloads and regular sections:', commonSchool.rows);

    if (commonSchool.rows.length > 0) {
      const targetSchool = commonSchool.rows[0].school_id;
      console.log(`\nDetailed look at school ${targetSchool}:`);
      const sampleWkl = await client.query(`
        SELECT id, section_id, section_name, grade_level, subject
        FROM esf7_workload_rows
        WHERE school_id = $1
        LIMIT 10;
      `, [targetSchool]);
      console.log('Workload rows:', sampleWkl.rows);

      const sampleSec = await client.query(`
        SELECT id, section_name, grade_level
        FROM esf7_regular_sections
        WHERE school_id = $1
        LIMIT 10;
      `, [targetSchool]);
      console.log('Regular section rows:', sampleSec.rows);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
