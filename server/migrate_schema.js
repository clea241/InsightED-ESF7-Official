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

    // === SHS WORKLOAD SEPARATION MIGRATION ===

    // Add teaches_shs flag to personnel_employment
    try {
      await db.query(`ALTER TABLE personnel_employment ADD COLUMN IF NOT EXISTS teaches_shs BOOLEAN DEFAULT FALSE`);
      console.log('✅ Added teaches_shs column to personnel_employment');
    } catch (e) {
      console.log('ℹ️  teaches_shs migration:', e.message);
    }

    // Create shs_workload_rows table
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS shs_workload_rows (
          id VARCHAR(50) PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          term TEXT NOT NULL CHECK (term IN ('1st', '2nd', '3rd')),
          row_type TEXT NOT NULL CHECK (row_type IN ('teaching', 'teaching-related', 'administrative')),
          subject TEXT,
          shs_category TEXT,
          task TEXT,
          grade_level TEXT,
          section_id VARCHAR(50) REFERENCES class_sections(id) ON DELETE CASCADE,
          start_time VARCHAR(20),
          end_time VARCHAR(20),
          days TEXT[] NOT NULL DEFAULT '{}',
          designated_by_sds BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_shs_workload_rows_personnel ON shs_workload_rows(personnel_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_shs_workload_rows_school ON shs_workload_rows(school_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_shs_workload_rows_term ON shs_workload_rows(term)`);
      console.log('✅ Created shs_workload_rows table and indexes');
    } catch (e) {
      console.log('ℹ️  shs_workload_rows migration:', e.message);
    }

    // Create shs_workload_transfers table
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS shs_workload_transfers (
          id VARCHAR(50) PRIMARY KEY,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          term TEXT NOT NULL CHECK (term IN ('1st', '2nd', '3rd')),
          absent_personnel_id VARCHAR(50) NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          substitute_personnel_id VARCHAR(50) NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          shs_workload_row_id VARCHAR(50) NOT NULL REFERENCES shs_workload_rows(id) ON DELETE CASCADE,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          reason TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
          logged_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log('✅ Created shs_workload_transfers table');
    } catch (e) {
      console.log('ℹ️  shs_workload_transfers migration:', e.message);
    }

    // Create shs_workload_row_dates table
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS shs_workload_row_dates (
          id VARCHAR(50) PRIMARY KEY,
          shs_workload_row_id VARCHAR(50) NOT NULL REFERENCES shs_workload_rows(id) ON DELETE CASCADE,
          task_date DATE,
          start_time VARCHAR(20),
          end_time VARCHAR(20),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_shs_row_dates_row ON shs_workload_row_dates(shs_workload_row_id)`);
      console.log('✅ Created shs_workload_row_dates table and index');
    } catch (e) {
      console.log('ℹ️  shs_workload_row_dates migration:', e.message);
    }

    console.log('\nAll migrations completed!');
  } catch (e) {
    console.error('Migration failed:', e.message);
  }
  process.exit(0);
}
run();
