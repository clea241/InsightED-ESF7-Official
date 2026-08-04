const db = require('./db');

async function run() {
  try {
    console.log('Running schema migrations...');

    // Add missing certification columns to schools table
    await db.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS certified_by TEXT`);
    console.log('✅ Added certified_by column');
    await db.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS certified_signature TEXT`);
    console.log('✅ Added certified_signature column');
    await db.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS certified_at TIMESTAMPTZ`);
    console.log('✅ Added certified_at column');

    // Fix deped_email constraint - make it allow empty string
    try {
      await db.query(`ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_deped_email_check`);
      console.log('✅ Dropped old deped_email check constraint');
    } catch (e) {
      console.log('ℹ️  No deped_email check constraint to drop (or different name)');
    }

    // Fix section_type check constraint to allow 'Regular'
    try {
      await db.query(`ALTER TABLE class_sections DROP CONSTRAINT IF EXISTS class_sections_section_type_check`);
      await db.query(`ALTER TABLE class_sections ADD CONSTRAINT class_sections_section_type_check 
        CHECK (section_type IN ('MULTIGRADE', 'MONO GRADE', 'NON GRADED', 'Regular', 'regular'))`);
      console.log('✅ Updated section_type constraint');
    } catch (e) {
      console.log('ℹ️  section_type constraint update:', e.message);
    }

    // Make deped_email NOT unique (allow blanks for multiple personnel without deped email)
    try {
      await db.query(`ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_deped_email_key`);
      console.log('✅ Dropped deped_email unique constraint');
    } catch (e) {
      console.log('ℹ️  No deped_email unique constraint found:', e.message);
    }

    // Ensure workload_rows.section_id column exists with ON DELETE CASCADE and index
    try {
      await db.query(`ALTER TABLE workload_rows ADD COLUMN IF NOT EXISTS section_id VARCHAR(50) REFERENCES class_sections(id) ON DELETE CASCADE`);
      // Find foreign key constraint name for section_id in workload_rows and update to ON DELETE CASCADE
      const fkRes = await db.query(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'workload_rows' AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%section_id%'
      `);
      for (const row of fkRes.rows) {
        await db.query(`ALTER TABLE workload_rows DROP CONSTRAINT IF EXISTS "${row.constraint_name}"`);
      }
      await db.query(`
        ALTER TABLE workload_rows 
        ADD CONSTRAINT workload_rows_section_id_fkey 
        FOREIGN KEY (section_id) REFERENCES class_sections(id) ON DELETE CASCADE
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_workload_rows_section_id ON workload_rows(section_id)`);
      console.log('✅ Updated workload_rows section_id FK to ON DELETE CASCADE and created index');
    } catch (e) {
      console.log('ℹ️  workload_rows section_id migration:', e.message);
    }

    // Ensure workload_rows.designated_by_sds column exists
    try {
      await db.query(`ALTER TABLE workload_rows ADD COLUMN IF NOT EXISTS designated_by_sds BOOLEAN DEFAULT FALSE`);
      console.log('✅ Added designated_by_sds column to workload_rows');
    } catch (e) {
      console.log('ℹ️  workload_rows designated_by_sds migration:', e.message);
    }

    console.log('\nAll migrations completed!');
  } catch (e) {
    console.error('Migration failed:', e.message);
  }
  process.exit(0);
}
run();
