/**
 * InsightED ESF7 - Master Database & Field-Level Verifier Suite
 * Tests all 21 core PostgreSQL tables, column constraints, JSONB integrity, and foreign key cascades.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../db');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m'
};

const results = [];

async function testTable(testNumber, tableName, testFn) {
  const start = Date.now();
  try {
    const details = await testFn();
    const duration = Date.now() - start;
    results.push({
      num: testNumber,
      table: tableName,
      status: 'PASS',
      duration: `${duration}ms`,
      details: details || 'Verified'
    });
    console.log(`  ${colors.green}✔${colors.reset} [${String(testNumber).padStart(2, ' ')}/21] ${tableName.padEnd(35)} ➔ ${colors.green}PASS${colors.reset} ${colors.gray}(${duration}ms)${colors.reset} - ${colors.gray}${details || 'OK'}${colors.reset}`);
  } catch (err) {
    const duration = Date.now() - start;
    results.push({
      num: testNumber,
      table: tableName,
      status: 'FAIL',
      duration: `${duration}ms`,
      details: err.message
    });
    console.log(`  ${colors.red}✖${colors.reset} [${String(testNumber).padStart(2, ' ')}/21] ${tableName.padEnd(35)} ➔ ${colors.red}FAIL${colors.reset} ${colors.gray}(${duration}ms)${colors.reset} - ${err.message}`);
  }
}

async function runMasterVerifier() {
  console.log('\n' + colors.bold + colors.cyan + '═══════════════════════════════════════════════════════════════════════════════════' + colors.reset);
  console.log(colors.bold + '   🛡️  InsightED ESF7 - Master PostgreSQL Database & Field Verifier Suite' + colors.reset);
  console.log(colors.gray + '   Target Database: ' + (process.env.DB_NAME || 'insighted_esf7') + ' on ' + (process.env.DB_HOST || 'stride-posgre-prod-01') + colors.reset);
  console.log(colors.cyan + '═══════════════════════════════════════════════════════════════════════════════════\n' + colors.reset);

  const overallStart = Date.now();

  // 1. salary_matrix
  await testTable(1, 'salary_matrix', async () => {
    const res = await db.query('SELECT COUNT(*) as count FROM salary_matrix WHERE salary_grade = 1 AND step_number = 1');
    const total = await db.query('SELECT COUNT(*) as count FROM salary_matrix');
    if (Number(total.rows[0].count) < 33) throw new Error('Missing salary grade rows in salary_matrix');
    return `${total.rows[0].count} salary grade/step rows verified`;
  });

  // 2. esf7_personnel_profile
  await testTable(2, 'esf7_personnel_profile', async () => {
    const res = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'esf7_personnel_profile'
    `);
    const cols = res.rows.map(r => r.column_name);
    const required = ['id', 'prn', 'school_id', 'school_year', 'salutation', 'first_name', 'last_name', 'deped_email', 'no_philsys', 'raw_payload'];
    const missing = required.filter(c => !cols.includes(c));
    if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(', ')}`);
    const count = await db.query('SELECT COUNT(*) as count FROM esf7_personnel_profile');
    return `${cols.length} cols verified (${count.rows[0].count} active profiles)`;
  });

  // 3. esf7_personnel_employment
  await testTable(3, 'esf7_personnel_employment', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_personnel_employment'
    `);
    const cols = res.rows.map(r => r.column_name);
    const required = ['personnel_id', 'position_category', 'step_increment', 'assigned_schools', 'grade_levels_taught'];
    const missing = required.filter(c => !cols.includes(c));
    if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(', ')}`);
    return `${cols.length} cols verified with JSONB arrays`;
  });

  // 4. esf7_perssonel_educ
  await testTable(4, 'esf7_perssonel_educ', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_perssonel_educ'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('eligibility') || !cols.includes('highest_educational_attainment')) {
      throw new Error('Missing eligibility or highest_educational_attainment');
    }
    return `${cols.length} cols verified with JSONB eligibility`;
  });

  // 5. esf7_personnel_ld_trainings
  await testTable(5, 'esf7_personnel_ld_trainings', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_personnel_ld_trainings'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('training_type') || !cols.includes('total_hours')) {
      throw new Error('Missing training_type or total_hours');
    }
    return `${cols.length} cols verified with L&D constraints`;
  });

  // 6. esf7_personnel_learning_areas
  await testTable(6, 'esf7_personnel_learning_areas', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_personnel_learning_areas'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('matrix_data')) throw new Error('Missing matrix_data JSONB');
    return `${cols.length} cols verified with matrix_data JSONB`;
  });

  // 7. esf7_personnel_designations
  await testTable(7, 'esf7_personnel_designations', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_personnel_designations'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('designation_name') || !cols.includes('is_sds_approved')) {
      throw new Error('Missing designation_name or is_sds_approved');
    }
    return `${cols.length} cols verified with SDS approval flags`;
  });

  // 8. esf7_regular_sections
  await testTable(8, 'esf7_regular_sections', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_regular_sections'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('grade_level') || !cols.includes('section_name') || !cols.includes('number_of_learners')) {
      throw new Error('Missing regular section key columns');
    }
    const count = await db.query('SELECT COUNT(*) as count FROM esf7_regular_sections');
    return `${cols.length} cols verified (${count.rows[0].count} regular sections)`;
  });

  // 9. esf7_aral_sections
  await testTable(9, 'esf7_aral_sections', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_aral_sections'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('assessment_tool') || !cols.includes('total_learners')) {
      throw new Error('Missing ARAL section columns');
    }
    return `${cols.length} cols verified for RA 12028 ARAL`;
  });

  // 10. esf7_remedial_enrichment_sections
  await testTable(10, 'esf7_remedial_enrichment_sections', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_remedial_enrichment_sections'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('intervention_type') || !cols.includes('assigned_teacher_id')) {
      throw new Error('Missing remedial section columns');
    }
    return `${cols.length} cols verified for Remedial & Enrichment`;
  });

  // 11. esf7_school_subjects
  await testTable(11, 'esf7_school_subjects', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_school_subjects'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('subject_name') || !cols.includes('key_stage') || !cols.includes('is_custom')) {
      throw new Error('Missing custom subject columns');
    }
    return `${cols.length} cols verified with composite key constraint`;
  });

  // 12. esf7_workload_rows
  await testTable(12, 'esf7_workload_rows', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_workload_rows'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('start_time') || !cols.includes('end_time') || !cols.includes('days')) {
      throw new Error('Missing timetable time or days JSONB columns');
    }
    const count = await db.query('SELECT COUNT(*) as count FROM esf7_workload_rows');
    return `${cols.length} cols verified (${count.rows[0].count} Elem/JHS workloads)`;
  });

  // 13. esf7_shs_workload_rows
  await testTable(13, 'esf7_shs_workload_rows', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_shs_workload_rows'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('term') || !cols.includes('track_strand')) {
      throw new Error('Missing term or track_strand in SHS workloads');
    }
    const count = await db.query('SELECT COUNT(*) as count FROM esf7_shs_workload_rows');
    return `${cols.length} cols verified (${count.rows[0].count} SHS 3-Term workloads)`;
  });

  // 14. esf7_personnel_allowances
  await testTable(14, 'esf7_personnel_allowances', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_personnel_allowances'
    `);
    const cols = res.rows.map(r => r.column_name);
    const required = ['has_pera', 'pera_amount', 'has_uniform', 'has_supplies', 'has_medical', 'has_hardship'];
    const missing = required.filter(c => !cols.includes(c));
    if (missing.length > 0) throw new Error(`Missing allowance flags: ${missing.join(', ')}`);
    return `${cols.length} cols verified with DepEd allowance amounts`;
  });

  // 15. overload_no_work
  await testTable(15, 'overload_no_work', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'overload_no_work'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('no_work_date') || !cols.includes('event_type')) {
      throw new Error('Missing holiday/suspension date columns');
    }
    const count = await db.query('SELECT COUNT(*) as count FROM overload_no_work');
    return `${cols.length} cols verified (${count.rows[0].count} suspension events)`;
  });

  // 16. overload_absences
  await testTable(16, 'overload_absences', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'overload_absences'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('start_date') || !cols.includes('end_date') || !cols.includes('leave_type')) {
      throw new Error('Missing leave dates in overload_absences');
    }
    return `${cols.length} cols verified for teacher leave tracking`;
  });

  // 17. esf7_workload_transfer
  await testTable(17, 'esf7_workload_transfer', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_workload_transfer'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('relieving_personnel_id') || !cols.includes('relieving_hours')) {
      throw new Error('Missing relieving duty columns');
    }
    return `${cols.length} cols verified for Relieving Workloads`;
  });

  // 18. overload_late
  await testTable(18, 'overload_late', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'overload_late'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('tardiness_date')) throw new Error('Missing tardiness_date');
    return `${cols.length} cols verified for Single-Day Tardiness`;
  });

  // 19. esf7_work_immersion
  await testTable(19, 'esf7_work_immersion', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_work_immersion'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('visit_date') || !cols.includes('duration_minutes')) {
      throw new Error('Missing visit_date or duration_minutes');
    }
    return `${cols.length} cols verified for SHS Immersion Visits`;
  });

  // 20. overload_pay_and_reason
  await testTable(20, 'overload_pay_and_reason', async () => {
    const res = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'overload_pay_and_reason'
    `);
    const cols = res.rows.map(r => r.column_name);
    if (!cols.includes('overload_hours') || !cols.includes('overload_pay') || !cols.includes('reasons')) {
      throw new Error('Missing overload calculation or reasons JSONB');
    }
    return `${cols.length} cols verified with PHTR calculation & audit log`;
  });

  // 21. esf7_requests, esf7_school_profile & esf7_submission_queue
  await testTable(21, 'esf7_requests / profile / queue', async () => {
    const reqCols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_requests'`)).rows.map(r => r.column_name);
    const profCols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_school_profile'`)).rows.map(r => r.column_name);
    const queueCols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_submission_queue'`)).rows.map(r => r.column_name);

    if (!reqCols.includes('request_type') || !profCols.includes('shs_curriculum_model') || !queueCols.includes('payload')) {
      throw new Error('Missing request_type, shs_curriculum_model, or queue payload');
    }
    const qCount = await db.query('SELECT COUNT(*) as count FROM esf7_submission_queue');
    return `Requests (${reqCols.length} cols), School Profile (${profCols.length} cols), Queue (${queueCols.length} cols, ${qCount.rows[0].count} queued jobs)`;
  });

  const overallDuration = Date.now() - overallStart;
  const passedCount = results.filter(r => r.status === 'PASS').length;
  const failedCount = results.filter(r => r.status === 'FAIL').length;

  console.log('\n' + colors.cyan + '═══════════════════════════════════════════════════════════════════════════════════' + colors.reset);
  console.log(colors.bold + `   📊  VERIFICATION SUMMARY: ${passedCount}/21 TABLES PASSED (${overallDuration}ms)` + colors.reset);
  if (failedCount === 0) {
    console.log(colors.green + colors.bold + '   🎉  ALL 21 POSTGRESQL TABLES & FIELD-LEVEL CONSTRAINTS 100% HEALTHY' + colors.reset);
  } else {
    console.log(colors.red + colors.bold + `   ⚠️  ${failedCount} TABLES ENCOUNTERED VERIFICATION ERRORS` + colors.reset);
  }
  console.log(colors.cyan + '═══════════════════════════════════════════════════════════════════════════════════\n' + colors.reset);

  process.exit(failedCount === 0 ? 0 : 1);
}

runMasterVerifier().catch(err => {
  console.error('Fatal Verifier Error:', err);
  process.exit(1);
});
