const db = require("./db");

async function run() {
  console.log("=== Migrating esf7_personnel_employment_position_category_check ===");

  try {
    // 1. Check existing rows
    const existingCounts = await db.query(`
      SELECT position_category, COUNT(*) as count
      FROM esf7_personnel_employment
      GROUP BY position_category;
    `);
    console.log("Current position_category distribution:", existingCounts.rows);

    // 2. Normalize any legacy non-standard rows if present
    const updateRes = await db.query(`
      UPDATE esf7_personnel_employment 
      SET position_category = CASE 
        WHEN position_category IN ('teaching-related', 'TEACHING-RELATED', 'related teaching', 'teaching_related', 'TEACHING_RELATED') THEN 'RELATED TEACHING'
        WHEN position_category = 'teaching' THEN 'TEACHING'
        WHEN position_category IN ('non-teaching', 'non_teaching', 'NON_TEACHING') THEN 'NON-TEACHING'
        ELSE position_category
      END
      WHERE position_category IN (
        'teaching-related', 'TEACHING-RELATED', 'related teaching', 'teaching_related', 'TEACHING_RELATED',
        'teaching', 'non-teaching', 'non_teaching', 'NON_TEACHING'
      );
    `);
    console.log(`Normalized ${updateRes.rowCount || 0} legacy rows to canonical values.`);

    // 3. Drop existing constraint
    console.log("Dropping existing constraint esf7_personnel_employment_position_category_check...");
    await db.query(`
      ALTER TABLE esf7_personnel_employment 
      DROP CONSTRAINT IF EXISTS esf7_personnel_employment_position_category_check;
    `);

    // 4. Re-add constraint with canonical + casing & hyphen/space variants
    console.log("Re-adding updated constraint with full variant coverage...");
    await db.query(`
      ALTER TABLE esf7_personnel_employment 
      ADD CONSTRAINT esf7_personnel_employment_position_category_check 
      CHECK (position_category = ANY (ARRAY[
        'TEACHING'::text, 
        'RELATED TEACHING'::text, 
        'NON-TEACHING'::text, 
        'TEACHING-RELATED'::text,
        'teaching'::text, 
        'teaching-related'::text, 
        'non-teaching'::text,
        'related teaching'::text
      ]));
    `);

    // 5. Verify constraint
    const checkRes = await db.query(`
      SELECT conname, pg_get_constraintdef(oid) as def 
      FROM pg_constraint 
      WHERE conrelid = 'esf7_personnel_employment'::regclass
        AND conname = 'esf7_personnel_employment_position_category_check';
    `);
    console.log("Verified new constraint definition:");
    console.log(checkRes.rows[0]);

    console.log("=== Migration completed successfully! ===");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
