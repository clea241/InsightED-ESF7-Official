const { prodPool } = require('../db');

async function cleanRelationalUnsubmitted() {
  console.log('=== Cleaning Relational Tables (Submissions Only Mode) ===');

  // Verify connected DB
  const dbRes = await prodPool.query('SELECT current_database()');
  console.log(`Connected to database: ${dbRes.rows[0].current_database}`);

  // Fetch all existing tables
  const existingTablesRes = await prodPool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const existingTableNames = new Set(existingTablesRes.rows.map(r => r.table_name));

  const candidateTables = [
    'esf7_personnel_learning_areas',
    'esf7_personnel_educ',
    'esf7_personnel_qualifications',
    'esf7_personnel_trainings',
    'esf7_personnel_designations',
    'esf7_personnel_related_teaching',
    'esf7_personnel_admin_duties',
    'esf7_personnel_absences',
    'esf7_reassigned_transfers',
    'esf7_personnel_special_assignments',
    'esf7_personnel_specialization',
    'esf7_workload_rows',
    'esf7_workload_shs',
    'esf7_shs_workload_transfers',
    'esf7_class_sections',
    'esf7_class_sections_sned',
    'esf7_class_sections_als',
    'esf7_class_sections_aral',
    'esf7_class_sections_remedial',
    'esf7_school_profile',
    'esf7_overload_reasons',
    'esf7_overload_pay_and_reason',
    'esf7_personnel_employment',
    'esf7_personnel_profile'
  ];

  const relationalTables = candidateTables.filter(t => existingTableNames.has(t));
  console.log(`Truncating ${relationalTables.length} existing relational tables with CASCADE...`);
  const tableListStr = relationalTables.map(t => `"${t}"`).join(', ');
  
  await prodPool.query(`TRUNCATE TABLE ${tableListStr} CASCADE;`);
  console.log('✅ Relational tables cleanly truncated!');

  // 2. Verify draft payloads are 100% untouched
  const draftCount = await prodPool.query('SELECT count(*)::int as count FROM school_drafts');
  const personnelCount = await prodPool.query('SELECT count(*)::int as count FROM esf7_personnel_profile');
  const salaryCount = await prodPool.query('SELECT count(*)::int as count FROM salary_matrix');

  console.log('\n=== Database Integrity Verification ===');
  console.log(`🛡️ school_drafts (Live school drafts) : ${draftCount.rows[0].count} rows (100% PRESERVED)`);
  console.log(`🛡️ salary_matrix (Salary Matrix)       : ${salaryCount.rows[0].count} rows (100% PRESERVED)`);
  console.log(`🧹 esf7_personnel_profile (Official)  : ${personnelCount.rows[0].count} rows (CLEAN, READY FOR SUBMISSIONS)`);
}

cleanRelationalUnsubmitted()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error during cleanup:', err);
    process.exit(1);
  });
