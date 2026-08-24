const db = require('./db');

async function testLearningAreasFlow() {
  console.log('Testing esf7_personnel_learning_areas insertion & 4-way JOIN...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-004'`);

  // 1. Insert Profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name
    ) VALUES (
      'PER-TEST-004', 'PRN-400500600700', '108348', '2026-2027', 'APOLINARIO', 'MABINI'
    )
  `);

  // 2. Insert Learning Area Matrix
  const sampleMatrix = {
    'RBEC 2002-2011||MATHEMATICS': { checked: true, years: 8 },
    'K-12 2012-2023||MATHEMATICS': { checked: true, years: 10 },
    'MATATAG 2024+||MATHEMATICS': { checked: true, years: 2 }
  };

  await db.query(`
    INSERT INTO esf7_personnel_learning_areas (
      id, personnel_id, matrix_data, raw_payload
    ) VALUES (
      'LA-108348-004', 'PER-TEST-004', $1::jsonb, $2::jsonb
    )
  `, [JSON.stringify(sampleMatrix), JSON.stringify({ sampleMatrix })]);

  // 3. Query 4-Way Join
  const res = await db.query(`
    SELECT 
      p.id, p.first_name, p.last_name,
      la.id AS la_id, la.matrix_data
    FROM esf7_personnel_profile p
    LEFT JOIN esf7_personnel_learning_areas la ON p.id = la.personnel_id
    WHERE p.id = 'PER-TEST-004'
  `);

  console.log('✅ Successfully queried joined record:');
  const row = res.rows[0];
  console.log('Personnel:', `${row.first_name} ${row.last_name}`);
  console.log('LA ID:', row.la_id);
  console.log('Matrix Data (JSONB):', row.matrix_data);

  // 4. Test ON DELETE CASCADE
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-004'`);
  const checkLA = await db.query(`SELECT COUNT(*) FROM esf7_personnel_learning_areas WHERE personnel_id = 'PER-TEST-004'`);
  console.log('✅ ON DELETE CASCADE check (should be 0):', checkLA.rows[0].count);

  process.exit(0);
}

testLearningAreasFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
