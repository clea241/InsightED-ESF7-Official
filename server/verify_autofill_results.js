const db = require('./db');

async function verify() {
  const schoolId = '502624';
  try {
    const pRes = await db.query('SELECT count(*) FROM personnel WHERE school_id = $1', [schoolId]);
    const sRes = await db.query('SELECT count(*) FROM class_sections WHERE school_id = $1', [schoolId]);
    const wRes = await db.query('SELECT count(*) FROM workload_rows WHERE school_id = $1', [schoolId]);

    console.log('===========================================');
    console.log(`📊 Auto-Populated Personnel Count   : ${pRes.rows[0].count}`);
    console.log(`🏫 Auto-Populated Class Sections     : ${sRes.rows[0].count}`);
    console.log(`📚 Auto-Populated Workload Rows      : ${wRes.rows[0].count}`);
    console.log('===========================================');

    const secRows = await db.query('SELECT grade_level, section_name FROM class_sections WHERE school_id = $1 ORDER BY grade_level, section_name', [schoolId]);
    console.log('\n📋 Organized Class Sections Created:');
    secRows.rows.forEach(r => console.log(`  • ${r.grade_level} - Section ${r.section_name}`));

    process.exit(0);
  } catch (err) {
    console.error('❌ Verification error:', err);
    process.exit(1);
  }
}

verify();
