const db = require('./db');
const { Pool } = require('pg');
require('dotenv').config();

async function testGetSchoolEndpoint() {
  console.log('Testing school retrieval for 100093...');

  const poolString = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
    : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

  const insightEdPool = new Pool({
    connectionString: poolString,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  const schoolId = '100093';

  // 1. Check local esf7_school_profile
  const localProf = await db.query('SELECT * FROM esf7_school_profile WHERE school_id = $1 OR school_id = $2', [schoolId, `SCH-${schoolId}`]).catch(e => ({ rows: [], err: e.message }));
  console.log('1. esf7_school_profile:', localProf.rows);

  // 2. Check local schools table
  const localSchools = await db.query('SELECT * FROM schools WHERE school_id = $1 OR school_id = $2', [schoolId, `SCH-${schoolId}`]).catch(e => ({ rows: [], err: e.message }));
  console.log('2. schools table:', localSchools.rows);

  // 3. Check unit1_school_identity
  const unit1 = await insightEdPool.query('SELECT school_id, school_name, region, division, district, curricular_offering FROM unit1_school_identity WHERE CAST(school_id AS TEXT) = $1', [schoolId]).catch(e => ({ rows: [], err: e.message }));
  console.log('3. unit1_school_identity:', unit1.rows);

  // 4. Check curricular offering logic
  if (unit1.rows.length > 0) {
    const row = unit1.rows[0];
    const dbOffering = (row.curricular_offering || '').toLowerCase();
    let offerings = [];
    if (dbOffering.includes('elementary') || dbOffering.includes('primary') || dbOffering.includes('purely') || dbOffering.includes('kinder')) {
      offerings.push('Elementary');
    }
    if (dbOffering.includes('jhs') || dbOffering.includes('junior') || dbOffering.includes('secondary') || dbOffering.includes('high school')) {
      offerings.push('JHS');
    }
    if (dbOffering.includes('shs') || dbOffering.includes('senior')) {
      offerings.push('SHS');
    }
    console.log('4. Computed offerings:', offerings);
  }

  await insightEdPool.end();
  process.exit(0);
}

testGetSchoolEndpoint();
