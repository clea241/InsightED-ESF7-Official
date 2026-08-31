const db = require('./db');
const express = require('express');

async function testAllInitialEndpoints() {
  console.log('Testing initial load endpoints for school 100093...');
  const schoolId = '100093';
  const schoolYear = 'SY 26-27';

  // 1. Test /api/school
  try {
    const schoolsRouter = require('./controllers/schools');
    console.log('✓ Loaded schools controller');
  } catch (e) {
    console.error('Error loading schools controller:', e);
  }

  // 2. Test /api/personnel
  try {
    const personnelRes = await db.query('SELECT * FROM esf7_personnel_profile WHERE school_id = $1 OR school_id = $2', [schoolId, `SCH-${schoolId}`]);
    console.log('✓ esf7_personnel_profile query succeeded, rows:', personnelRes.rows.length);
  } catch (e) {
    console.error('Error in personnel query:', e.message);
  }

  // 3. Test /api/sections
  try {
    const [regRes, aralRes, remRes] = await Promise.all([
      db.query(`SELECT * FROM esf7_regular_sections WHERE school_id = $1 OR school_id = $2`, [schoolId, `SCH-${schoolId}`]),
      db.query(`SELECT * FROM esf7_aral_sections WHERE school_id = $1 OR school_id = $2`, [schoolId, `SCH-${schoolId}`]),
      db.query(`SELECT * FROM esf7_remedial_enrichment_sections WHERE school_id = $1 OR school_id = $2`, [schoolId, `SCH-${schoolId}`])
    ]);
    console.log('✓ Sections query succeeded:', { regular: regRes.rows.length, aral: aralRes.rows.length, remedial: remRes.rows.length });
  } catch (e) {
    console.error('Error in sections query:', e.message);
  }

  // 4. Test /api/school/draft
  try {
    const draftRes = await db.query('SELECT * FROM esf7_school_drafts WHERE school_id = $1', [schoolId]).catch(e => ({ rows: [], err: e.message }));
    console.log('✓ esf7_school_drafts:', draftRes);
  } catch (e) {
    console.error('Error in school drafts query:', e.message);
  }

  // 5. Test allowances
  try {
    const allowancesRes = await db.query('SELECT * FROM esf7_personnel_allowances WHERE school_id = $1', [schoolId]).catch(e => ({ rows: [], err: e.message }));
    console.log('✓ esf7_personnel_allowances:', allowancesRes);
  } catch (e) {
    console.error('Error in allowances query:', e.message);
  }

  process.exit(0);
}

testAllInitialEndpoints();
