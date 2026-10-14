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
    console.log('--- esf7_workload_rows section_id stats ---');
    const wklStats = await client.query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(section_id) as with_section_id,
        COUNT(section_name) as with_section_name
      FROM esf7_workload_rows;
    `);
    console.log('Workload stats:', wklStats.rows[0]);

    console.log('\n--- Section table row counts ---');
    const regCount = await client.query('SELECT COUNT(*) FROM esf7_regular_sections');
    const alsCount = await client.query('SELECT COUNT(*) FROM esf7_als_sections');
    const aralCount = await client.query('SELECT COUNT(*) FROM esf7_aral_sections');
    const snedCount = await client.query('SELECT COUNT(*) FROM esf7_sned_sections');
    console.log({
      regular: regCount.rows[0].count,
      als: alsCount.rows[0].count,
      aral: aralCount.rows[0].count,
      sned: snedCount.rows[0].count
    });

    console.log('\n--- Sample workload rows with section info ---');
    const sampleWkl = await client.query(`
      SELECT id, school_id, personnel_id, section_id, section_name, grade_level, subject
      FROM esf7_workload_rows
      WHERE section_name IS NOT NULL AND TRIM(section_name) != ''
      LIMIT 10;
    `);
    console.log(sampleWkl.rows);

    console.log('\n--- Sample regular section rows ---');
    const sampleReg = await client.query(`
      SELECT id, school_id, section_name, grade_level
      FROM esf7_regular_sections
      WHERE school_id = $1
      LIMIT 10;
    `, [sampleWkl.rows[0]?.school_id || '100001']);
    console.log(`Regular sections for school ${sampleWkl.rows[0]?.school_id}:`, sampleReg.rows);

    console.log('\n--- Checking matches for regular sections (name match on school_id) ---');
    const regMatches = await client.query(`
      SELECT COUNT(*) 
      FROM esf7_workload_rows w
      JOIN esf7_regular_sections r 
        ON w.school_id = r.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(r.section_name))
      WHERE w.section_name IS NOT NULL AND TRIM(w.section_name) != '';
    `);
    console.log('Matches with regular_sections (name match):', regMatches.rows[0].count);

    console.log('\n--- Checking matches for regular sections (name + grade_level match) ---');
    const regGradeMatches = await client.query(`
      SELECT COUNT(*) 
      FROM esf7_workload_rows w
      JOIN esf7_regular_sections r 
        ON w.school_id = r.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(r.section_name))
        AND UPPER(TRIM(COALESCE(w.grade_level, ''))) = UPPER(TRIM(COALESCE(r.grade_level, '')))
      WHERE w.section_name IS NOT NULL AND TRIM(w.section_name) != '';
    `);
    console.log('Matches with regular_sections (name + grade match):', regGradeMatches.rows[0].count);

    console.log('\n--- Checking matches for ALS sections ---');
    const alsMatches = await client.query(`
      SELECT COUNT(*) 
      FROM esf7_workload_rows w
      JOIN esf7_als_sections a
        ON w.school_id = a.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(a.section_name))
      WHERE w.section_name IS NOT NULL AND TRIM(w.section_name) != '';
    `);
    console.log('Matches with als_sections:', alsMatches.rows[0].count);

    console.log('\n--- Checking matches for ARAL sections ---');
    const aralMatches = await client.query(`
      SELECT COUNT(*) 
      FROM esf7_workload_rows w
      JOIN esf7_aral_sections ar
        ON w.school_id = ar.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(ar.section_name))
      WHERE w.section_name IS NOT NULL AND TRIM(w.section_name) != '';
    `);
    console.log('Matches with aral_sections:', aralMatches.rows[0].count);

    console.log('\n--- Checking matches for SNED sections ---');
    const snedMatches = await client.query(`
      SELECT COUNT(*) 
      FROM esf7_workload_rows w
      JOIN esf7_sned_sections s
        ON w.school_id = s.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(s.section_name))
      WHERE w.section_name IS NOT NULL AND TRIM(w.section_name) != '';
    `);
    console.log('Matches with sned_sections:', snedMatches.rows[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
