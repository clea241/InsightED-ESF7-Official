const db = require("../db");

async function createCompatibilityView() {
  const sql = `
    CREATE OR REPLACE VIEW esf7_class_sections AS
    SELECT id, school_id, school_year, grade_level, section_name, adviser_id AS advisor_id, section_type, male_learners, female_learners, number_of_learners, raw_payload, created_at, updated_at FROM esf7_regular_sections
    UNION ALL
    SELECT id, school_id, school_year, grade_level, section_name, adviser_id AS advisor_id, 'SNED' AS section_type, male_learners, female_learners, number_of_learners, raw_payload, created_at, updated_at FROM esf7_sned_sections
    UNION ALL
    SELECT id, school_id, school_year, grade_level, section_name, adviser_id AS advisor_id, 'ALS' AS section_type, male_learners, female_learners, number_of_learners, raw_payload, created_at, updated_at FROM esf7_als_sections
    UNION ALL
    SELECT id, school_id, school_year, grade_level, section_name, tutor_id AS advisor_id, 'ARAL' AS section_type, male_learners, female_learners, total_learners AS number_of_learners, raw_payload, created_at, updated_at FROM esf7_aral_sections
    UNION ALL
    SELECT id, school_id, school_year, grade_level, section_name, assigned_teacher_id AS advisor_id, intervention_type AS section_type, male_learners, female_learners, total_learners AS number_of_learners, raw_payload, created_at, updated_at FROM esf7_remedial_enrichment_sections;
  `;

  try {
    await db.query(sql);
    console.log("✓ Created esf7_class_sections compatibility view in primary DB (insighted_esf7)");
    await db.getStagingPool().query(sql);
    console.log("✓ Created esf7_class_sections compatibility view in staging DB (insighted_esf7_staging)");
  } catch (err) {
    console.error("Error creating compatibility view:", err.message);
  } finally {
    process.exit(0);
  }
}

createCompatibilityView();
