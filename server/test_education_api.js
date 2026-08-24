const db = require('./db');

async function testEducationFlow() {
  console.log('Testing esf7_perssonel_educ insertion, RA 1080 preservation & 3-way JOIN...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-002'`);

  // Insert profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name
    ) VALUES (
      'PER-TEST-002', 'PRN-200300400500', '108348', '2026-2027', 'PEDRO', 'PENDUKO'
    )
  `);

  // Insert employment
  await db.query(`
    INSERT INTO esf7_personnel_employment (
      id, personnel_id, position_category, position, fund_source, nature_of_appointment, hiring_arrangement
    ) VALUES (
      'EMP-108348-002', 'PER-TEST-002', 'TEACHING', 'TEACHER III', 'NATIONAL', 'REGULAR PERMANENT', 'PERMANENT'
    )
  `);

  // Insert education with custom RA 1080 input
  const customRa1080 = 'RA 1080 - REGISTERED GUIDANCE COUNSELOR';
  await db.query(`
    INSERT INTO esf7_perssonel_educ (
      id, personnel_id, college_degree, major, minor, post_graduate_degree,
      post_graduate_discipline, eligibility, prc_specialization, raw_payload
    ) VALUES (
      'EDU-108348-002', 'PER-TEST-002', 'BACHELOR OF SECONDARY EDUCATION', 'ENGLISH', 'N/A',
      'MASTER OF ARTS IN EDUCATION', 'EDUCATIONAL MANAGEMENT',
      $1::jsonb, 'ENGLISH',
      $2::jsonb
    )
  `, [
    JSON.stringify(['LICENSURE EXAMINATION FOR TEACHERS', customRa1080]),
    JSON.stringify({ customRa1080Text: customRa1080 })
  ]);

  // Query 3-Way Join
  const res = await db.query(`
    SELECT 
      p.id, p.first_name, p.last_name,
      e.position, e.position_category,
      ed.college_degree, ed.major, ed.post_graduate_degree, ed.eligibility, ed.prc_specialization
    FROM esf7_personnel_profile p
    LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
    LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
    WHERE p.id = 'PER-TEST-002'
  `);

  console.log('✅ Successfully joined 3 tables:');
  const row = res.rows[0];
  console.log('Personnel:', `${row.first_name} ${row.last_name}`);
  console.log('Position:', row.position);
  console.log('Degree:', row.college_degree);
  console.log('Major:', row.major);
  console.log('Post-Grad Degree:', row.post_graduate_degree);
  console.log('Eligibilities (JSONB):', row.eligibility);

  const hasRa1080 = row.eligibility.includes(customRa1080);
  console.log('✅ RA 1080 Custom Input Preserved:', hasRa1080);

  // Clean up
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-002'`);
  console.log('🧹 Cleaned up test records (ON DELETE CASCADE removed linked employment and educ records).');
  process.exit(0);
}

testEducationFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
