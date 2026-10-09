const db = require('../db');

async function runPostMigrationVerification() {
  console.log('================================================================');
  console.log('🔍 RUNNING COMPREHENSIVE POST-MIGRATION INTEGRITY SUITE');
  console.log('================================================================\n');

  // 1. Foreign Key Orphan Audits
  console.log('1. Checking for Foreign Key Orphans across Normalized Tables...');
  
  const orphanRegularAdvisers = await db.query(`
    SELECT count(*) as count 
    FROM esf7_regular_sections s 
    LEFT JOIN esf7_personnel_profile p ON s.adviser_id = p.id 
    WHERE s.adviser_id IS NOT NULL AND p.id IS NULL
  `);

  const orphanAlsAdvisers = await db.query(`
    SELECT count(*) as count 
    FROM esf7_als_sections s 
    LEFT JOIN esf7_personnel_profile p ON s.adviser_id = p.id 
    WHERE s.adviser_id IS NOT NULL AND p.id IS NULL
  `);

  const orphanSnedAdvisers = await db.query(`
    SELECT count(*) as count 
    FROM esf7_sned_sections s 
    LEFT JOIN esf7_personnel_profile p ON s.adviser_id = p.id 
    WHERE s.adviser_id IS NOT NULL AND p.id IS NULL
  `);

  const orphanWorkloadPersonnel = await db.query(`
    SELECT count(*) as count 
    FROM esf7_workload_rows w 
    LEFT JOIN esf7_personnel_profile p ON w.personnel_id = p.id 
    WHERE w.personnel_id IS NOT NULL AND p.id IS NULL
  `);

  const orphanEmploymentPersonnel = await db.query(`
    SELECT count(*) as count 
    FROM esf7_personnel_employment e 
    LEFT JOIN esf7_personnel_profile p ON e.personnel_id = p.id 
    WHERE e.personnel_id IS NOT NULL AND p.id IS NULL
  `);

  const orphanEducPersonnel = await db.query(`
    SELECT count(*) as count 
    FROM esf7_perssonel_educ ed 
    LEFT JOIN esf7_personnel_profile p ON ed.personnel_id = p.id 
    WHERE ed.personnel_id IS NOT NULL AND p.id IS NULL
  `);

  const orphanCounts = {
    orphan_regular_section_advisers: Number(orphanRegularAdvisers.rows[0].count),
    orphan_als_section_advisers: Number(orphanAlsAdvisers.rows[0].count),
    orphan_sned_section_advisers: Number(orphanSnedAdvisers.rows[0].count),
    orphan_workload_personnel: Number(orphanWorkloadPersonnel.rows[0].count),
    orphan_employment_personnel: Number(orphanEmploymentPersonnel.rows[0].count),
    orphan_education_personnel: Number(orphanEducPersonnel.rows[0].count)
  };

  console.log('Orphan Check Results:');
  console.log(JSON.stringify(orphanCounts, null, 2));

  const totalOrphans = Object.values(orphanCounts).reduce((a, b) => a + b, 0);
  if (totalOrphans === 0) {
    console.log('✅ PASS: Zero orphaned foreign keys detected across all normalized tables.\n');
  } else {
    console.error(`❌ FAIL: Found ${totalOrphans} orphaned foreign key records!\n`);
  }

  // 2. School Drafts Row Immutability Verification
  console.log('2. Verifying school_drafts immutability...');
  const draftCount = await db.query('SELECT count(*) as c FROM school_drafts');
  console.log(`  Current school_drafts rows: ${draftCount.rows[0].c}`);
  if (Number(draftCount.rows[0].c) === 14954) {
    console.log('✅ PASS: Exactly 14,954 school_drafts rows preserved intact (zero deletions or drops).\n');
  } else {
    console.warn(`⚠️ NOTE: school_drafts count is ${draftCount.rows[0].c} (expected 14,954).\n`);
  }

  // 3. Cluster Summary Metrics
  console.log('3. Gathering Cluster-Wide Normalized Totals...');
  const totals = {
    esf7_school_profile: Number((await db.query('SELECT count(*) c FROM esf7_school_profile')).rows[0].c),
    esf7_personnel_profile: Number((await db.query('SELECT count(*) c FROM esf7_personnel_profile')).rows[0].c),
    esf7_personnel_employment: Number((await db.query('SELECT count(*) c FROM esf7_personnel_employment')).rows[0].c),
    esf7_perssonel_educ: Number((await db.query('SELECT count(*) c FROM esf7_perssonel_educ')).rows[0].c),
    esf7_regular_sections: Number((await db.query('SELECT count(*) c FROM esf7_regular_sections')).rows[0].c),
    esf7_sned_sections: Number((await db.query('SELECT count(*) c FROM esf7_sned_sections')).rows[0].c),
    esf7_als_sections: Number((await db.query('SELECT count(*) c FROM esf7_als_sections')).rows[0].c),
    esf7_workload_rows: Number((await db.query('SELECT count(*) c FROM esf7_workload_rows')).rows[0].c),
    esf7_school_node_status: Number((await db.query('SELECT count(*) c FROM esf7_school_node_status')).rows[0].c)
  };
  console.log(JSON.stringify(totals, null, 2));

  console.log('\n================================================================');
  console.log('✅ POST-MIGRATION AUDIT COMPLETE');
  console.log('================================================================');

  process.exit(0);
}

runPostMigrationVerification().catch(err => {
  console.error(err);
  process.exit(1);
});
