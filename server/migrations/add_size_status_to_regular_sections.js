const db = require('../db');

function calculateSizeStatus(gradeLevel, totalLearners, sectionType = '') {
  const total = Number(totalLearners) || 0;
  if (!total || total === 0) return 'UNSET';

  const gradeStr = String(gradeLevel || '').toUpperCase().trim();
  const typeStr = String(sectionType || '').toUpperCase().trim();

  // Multigrade Classes (MG) - Maximum of 25 learners
  if (typeStr.includes('MULTI') || gradeStr.includes('MULTI') || gradeStr.includes('MG')) {
    if (total <= 25) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  // Special Needs Education (SNED / SPED)
  if (gradeStr.includes('SNED') || gradeStr.includes('SPED')) {
    if (total < 5) return 'BELOW STANDARD';
    if (total <= 15) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  // Alternative Learning System (ALS)
  if (gradeStr.includes('ALS')) {
    if (total < 15) return 'BELOW STANDARD';
    if (total <= 50) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  // Kindergarten: 25 learners or maximum of 30 learners per session
  if (gradeStr.includes('KINDER')) {
    if (total < 25) return 'BELOW STANDARD';
    if (total <= 30) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  // Grades 1 to 3: 30 learners per class, maximum of 35 learners
  if (['GRADE 1', 'GRADE 2', 'GRADE 3', '1', '2', '3', 'G1', 'G2', 'G3'].some(g => gradeStr === g || gradeStr.includes(g))) {
    if (total < 30) return 'BELOW STANDARD';
    if (total <= 35) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  // Grade 4: 40 learners per class, maximum of 45 learners
  if (gradeStr === 'GRADE 4' || gradeStr === '4' || gradeStr === 'G4' || gradeStr.includes('GRADE 4')) {
    if (total < 40) return 'BELOW STANDARD';
    if (total <= 45) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  // Grades 5 to 10: 40 learners per class, maximum of 45 learners
  if (['GRADE 5', 'GRADE 6', 'GRADE 7', 'GRADE 8', 'GRADE 9', 'GRADE 10', '5', '6', '7', '8', '9', '10', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'JHS'].some(g => gradeStr === g || gradeStr.includes(g))) {
    if (total < 40) return 'BELOW STANDARD';
    if (total <= 45) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  // Grades 11 to 12 (Senior High School): Maximum of 40 learners per class
  if (['GRADE 11', 'GRADE 12', '11', '12', 'G11', 'G12', 'SHS'].some(g => gradeStr === g || gradeStr.includes(g))) {
    if (total < 30) return 'BELOW STANDARD';
    if (total <= 40) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  // Default fallback (40-45)
  if (total < 40) return 'BELOW STANDARD';
  if (total <= 45) return 'WITHIN STANDARD';
  return 'ABOVE STANDARD';
}

async function runMigration() {
  try {
    console.log('--- Migrating esf7_regular_sections: Adding size_status column ---');

    // 1. Add column if it does not exist
    await db.query(`ALTER TABLE esf7_regular_sections ADD COLUMN IF NOT EXISTS size_status TEXT DEFAULT 'WITHIN STANDARD';`);
    console.log('✓ Added size_status column to esf7_regular_sections table.');

    // 2. Fetch all existing sections and backfill
    const sectionsRes = await db.query(`SELECT id, grade_level, section_type, number_of_learners FROM esf7_regular_sections;`);
    console.log(`Found ${sectionsRes.rows.length} existing regular sections to backfill...`);

    for (const sec of sectionsRes.rows) {
      const status = calculateSizeStatus(sec.grade_level, sec.number_of_learners, sec.section_type);
      await db.query(`UPDATE esf7_regular_sections SET size_status = $1 WHERE id = $2;`, [status, sec.id]);
    }

    console.log('✓ Backfill completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
