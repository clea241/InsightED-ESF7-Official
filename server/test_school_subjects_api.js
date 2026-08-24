const db = require('./db');

async function testSchoolSubjectsFlow() {
  console.log('Testing esf7_school_subjects custom subject insertion & retrieval...');

  await db.query(`DELETE FROM esf7_school_subjects WHERE id = 'SUB-108348-001' OR subject_name = 'ROBOTICS & ARTIFICIAL INTELLIGENCE'`);

  // 1. Insert Custom Subject
  await db.query(`
    INSERT INTO esf7_school_subjects (
      id, school_id, school_year, subject_name, key_stage, grade_level, shs_category, is_custom, is_active, raw_payload
    ) VALUES (
      'SUB-108348-001', '108348', '2026-2027', 'ROBOTICS & ARTIFICIAL INTELLIGENCE', 'Junior High School', 'Grade 7', NULL,
      TRUE, TRUE, '{"subjectName": "ROBOTICS & ARTIFICIAL INTELLIGENCE", "keyStage": "Junior High School"}'::jsonb
    )
  `);

  // 2. Query Custom Subjects
  const res = await db.query(`
    SELECT * FROM esf7_school_subjects WHERE school_id = '108348' AND is_active = TRUE
  `);

  console.log('✅ Successfully retrieved custom subject record:');
  const row = res.rows[0];
  console.log('Subject ID:', row.id);
  console.log('Subject Name:', row.subject_name);
  console.log('Key Stage:', row.key_stage);
  console.log('Is Custom Flag:', row.is_custom);
  console.log('Is Active Flag:', row.is_active);

  // Clean up
  await db.query(`DELETE FROM esf7_school_subjects WHERE id = 'SUB-108348-001'`);
  console.log('🧹 Cleaned up test records.');
  process.exit(0);
}

testSchoolSubjectsFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
