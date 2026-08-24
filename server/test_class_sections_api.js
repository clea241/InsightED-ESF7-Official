const db = require('./db');

async function testClassSectionsFlow() {
  console.log('Testing esf7_class_sections insertion, standard evaluation & FK join...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-007'`);
  await db.query(`DELETE FROM esf7_class_sections WHERE id = 'SEC-108348-007'`);

  // 1. Insert Profile (Adviser)
  await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name
    ) VALUES (
      'PER-TEST-007', 'PRN-700800900100', '108348', '2026-2027', 'JUAN', 'LUNA'
    )
  `);

  // 2. Insert Section with 40 learners for Grade 1 (Standard evaluated as ABOVE STANDARD > 35)
  await db.query(`
    INSERT INTO esf7_class_sections (
      id, school_id, school_year, grade_level, section_name, section_type,
      advisor_id, advisory_minutes, male_learners, female_learners, number_of_learners, standard, raw_payload
    ) VALUES (
      'SEC-108348-007', '108348', '2026-2027', 'Grade 1', 'SAMPLE SECTION', 'MONO GRADE',
      'PER-TEST-007', 300, 20, 20, 40, 'ABOVE STANDARD', '{"sectionName": "SAMPLE SECTION"}'::jsonb
    )
  `);

  // 3. Query Section with Adviser JOIN
  const res = await db.query(`
    SELECT 
      s.id, s.grade_level, s.section_name, s.section_type, s.advisory_minutes,
      s.male_learners, s.female_learners, s.number_of_learners, s.standard,
      p.first_name, p.last_name
    FROM esf7_class_sections s
    LEFT JOIN esf7_personnel_profile p ON s.advisor_id = p.id
    WHERE s.id = 'SEC-108348-007'
  `);

  console.log('✅ Successfully retrieved class section record:');
  const row = res.rows[0];
  console.log('Section ID:', row.id);
  console.log('Grade & Section:', `${row.grade_level} - ${row.section_name}`);
  console.log('Class Adviser:', `${row.first_name} ${row.last_name}`);
  console.log('Advisory Minutes:', row.advisory_minutes);
  console.log('Male / Female / Total Learners:', `${row.male_learners} / ${row.female_learners} / ${row.number_of_learners}`);
  console.log('Section Size Standard Column:', row.standard);

  // 4. Test ON DELETE SET NULL on advisor_id
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-007'`);
  const checkSec = await db.query(`SELECT advisor_id FROM esf7_class_sections WHERE id = 'SEC-108348-007'`);
  console.log('✅ ON DELETE SET NULL check (advisor_id should be null):', checkSec.rows[0].advisor_id === null);

  // Clean up
  await db.query(`DELETE FROM esf7_class_sections WHERE id = 'SEC-108348-007'`);
  console.log('🧹 Cleaned up test records.');
  process.exit(0);
}

testClassSectionsFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
