const db = require('./db');
const { Pool } = require('pg');
require('dotenv').config();

async function inspect100093() {
  console.log('Inspecting school 100093...');
  try {
    const localRes = await db.query('SELECT * FROM esf7_school_profile WHERE school_id = $1 LIMIT 1', ['100093']);
    console.log('esf7_school_profile (insighted_esf7):', localRes.rows);

    const localSchools = await db.query('SELECT * FROM schools WHERE school_id = $1 LIMIT 1', ['100093']).catch(() => ({ rows: [] }));
    console.log('schools (insighted_esf7):', localSchools.rows);

    const poolString = process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
      : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;
    
    const insightEdPool = new Pool({
      connectionString: poolString,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    const unit1Res = await insightEdPool.query('SELECT * FROM unit1_school_identity WHERE school_id = $1 LIMIT 1', ['100093']).catch(e => ({ rows: [], err: e.message }));
    console.log('unit1_school_identity (insightEd):', unit1Res.rows);

    const esf7DbRes = await insightEdPool.query('SELECT DISTINCT school_id, schoool_id, school_name, division, region, muncipality FROM esf7_database WHERE school_id = 100093 OR schoool_id = 100093 LIMIT 1').catch(e => ({ rows: [], err: e.message }));
    console.log('esf7_database (insightEd):', esf7DbRes.rows);

    const usersRes = await insightEdPool.query('SELECT school_id, email, username FROM users WHERE school_id = $1 OR username = $1 LIMIT 5', ['100093']).catch(e => ({ rows: [], err: e.message }));
    console.log('users (insightEd):', usersRes.rows);

    await insightEdPool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

inspect100093();
