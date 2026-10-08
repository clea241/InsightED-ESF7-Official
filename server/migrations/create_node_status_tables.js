const { pool } = require('../db/index.js');

async function migrateNodeStatusTables() {
  console.log('🚀 [Migration] Creating Node Status Tables & Views in insighted_esf7...');

  try {
    // 1. Create esf7_school_node_status (1 School = 1 Row)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS esf7_school_node_status (
          school_id VARCHAR(255) NOT NULL,
          school_year VARCHAR(50) NOT NULL DEFAULT 'SY 26-27',
          overall_status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS',
          overall_percentage INTEGER NOT NULL DEFAULT 0,
          
          -- Node JSONB Columns (Milestone Snapshots)
          node_01_school JSONB NOT NULL DEFAULT '{}'::jsonb,
          node_02_roster JSONB NOT NULL DEFAULT '{}'::jsonb,
          node_05_requests JSONB NOT NULL DEFAULT '{}'::jsonb,
          node_06_classes JSONB NOT NULL DEFAULT '{}'::jsonb,
          node_10_overload JSONB NOT NULL DEFAULT '{}'::jsonb,
          node_11_validation JSONB NOT NULL DEFAULT '{}'::jsonb,
          
          -- Live Rollup Summary of Personnel Progress
          personnel_summary JSONB NOT NULL DEFAULT '{"total_personnel":0,"profiling_completed":0,"workload_completed":0,"all_personnel_ready":false}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT pk_esf7_school_node_status PRIMARY KEY (school_id, school_year)
      );

      CREATE INDEX IF NOT EXISTS idx_school_node_status_lookup ON esf7_school_node_status (school_id, school_year);
      CREATE INDEX IF NOT EXISTS idx_school_node_status_overall ON esf7_school_node_status (overall_status);
      CREATE INDEX IF NOT EXISTS idx_school_node_status_gin ON esf7_school_node_status USING GIN (personnel_summary, node_11_validation);
    `);
    console.log('✅ Table `esf7_school_node_status` verified / created.');

    // 2. Create esf7_personnel_node_status (1 Personnel = 1 Row)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_node_status (
          school_id VARCHAR(255) NOT NULL,
          school_year VARCHAR(50) NOT NULL DEFAULT 'SY 26-27',
          personnel_id VARCHAR(255) NOT NULL,
          personnel_name TEXT NOT NULL,
          position_title TEXT DEFAULT '',
          category VARCHAR(50) DEFAULT 'TEACHING',
          is_school_head BOOLEAN DEFAULT false,
          is_complete BOOLEAN DEFAULT false,
          
          -- Personnel Node JSONB Columns
          node_03_room_qr JSONB NOT NULL DEFAULT '{}'::jsonb,
          node_04_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
          node_07_designation JSONB NOT NULL DEFAULT '{}'::jsonb,
          node_08_workload JSONB NOT NULL DEFAULT '{}'::jsonb,
          node_09_allowances JSONB NOT NULL DEFAULT '{}'::jsonb,
          
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT pk_esf7_personnel_node_status PRIMARY KEY (school_id, school_year, personnel_id)
      );

      CREATE INDEX IF NOT EXISTS idx_personnel_node_status_lookup ON esf7_personnel_node_status (school_id, school_year, personnel_id);
      CREATE INDEX IF NOT EXISTS idx_personnel_node_status_complete ON esf7_personnel_node_status (school_id, is_complete);
    `);
    console.log('✅ Table `esf7_personnel_node_status` verified / created.');

    // 2.5 Ensure schools_iern reference table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schools_iern (
        school_id VARCHAR(50) PRIMARY KEY,
        school_name VARCHAR(255),
        region VARCHAR(100),
        division VARCHAR(150),
        district VARCHAR(150),
        is_testaccount BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_schools_iern_region ON schools_iern(region);
      CREATE INDEX IF NOT EXISTS idx_schools_iern_division ON schools_iern(division);
      CREATE INDEX IF NOT EXISTS idx_schools_iern_district ON schools_iern(district);
    `);
    console.log('✅ Table `schools_iern` verified / created.');

    // 3. Create SQL Boolean View: vw_esf7_school_node_progress
    await pool.query(`
      DROP VIEW IF EXISTS vw_esf7_school_node_progress CASCADE;
      CREATE OR REPLACE VIEW vw_esf7_school_node_progress AS
      SELECT
          s.school_id,
          COALESCE(i.school_name, s.school_id)                              AS school_name,
          i.region,
          i.division,
          i.district,
          s.school_year,
          CASE
            WHEN (
              COALESCE((s.node_01_school->>'status') = 'COMPLETED', false) AND
              COALESCE((s.node_02_roster->>'status') = 'COMPLETED', false) AND
              COALESCE((s.node_06_classes->>'status') = 'COMPLETED', false) AND
              COALESCE((s.node_11_validation->>'status') = 'COMPLETED', false) AND
              COALESCE((s.personnel_summary->>'all_personnel_ready')::boolean, false)
            ) THEN 'COMPLETED'
            WHEN s.overall_percentage > 0 THEN 'IN_PROGRESS'
            ELSE 'NOT_STARTED'
          END                                                               AS overall_status,
          s.overall_percentage,
          
          -- Node Boolean Flags (Evaluated dynamically from JSON)
          COALESCE((s.node_01_school->>'status') = 'COMPLETED', false)      AS is_node_01_school_completed,
          COALESCE((s.node_02_roster->>'status') = 'COMPLETED', false)      AS is_node_02_roster_completed,
          COALESCE((s.node_05_requests->>'status') = 'COMPLETED', false)    AS is_node_05_requests_completed,
          COALESCE((s.node_06_classes->>'status') = 'COMPLETED', false)     AS is_node_06_classes_completed,
          COALESCE((s.node_10_overload->>'status') = 'COMPLETED', false)    AS is_node_10_overload_completed,
          COALESCE((s.node_11_validation->>'status') = 'COMPLETED', false)  AS is_node_11_validation_completed,

          -- Teacher Rollup Booleans
          COALESCE((s.personnel_summary->>'all_personnel_ready')::boolean, false) AS is_all_personnel_completed,
          COALESCE((s.personnel_summary->>'total_personnel')::int, 0)             AS total_personnel_count,
          COALESCE((s.personnel_summary->>'profiling_completed')::int, 0)         AS profiling_completed_count,
          COALESCE((s.personnel_summary->>'workload_completed')::int, 0)          AS workload_completed_count,

          -- Master Completion Flag
          (
            COALESCE((s.node_01_school->>'status') = 'COMPLETED', false) AND
            COALESCE((s.node_02_roster->>'status') = 'COMPLETED', false) AND
            COALESCE((s.node_06_classes->>'status') = 'COMPLETED', false) AND
            COALESCE((s.node_11_validation->>'status') = 'COMPLETED', false) AND
            COALESCE((s.personnel_summary->>'all_personnel_ready')::boolean, false)
          ) AS is_all_nodes_completed,

          s.updated_at
      FROM esf7_school_node_status s
      LEFT JOIN schools_iern i ON (
        CAST(s.school_id AS TEXT) = CAST(i.school_id AS TEXT) 
        OR s.school_id = ('SCH-' || CAST(i.school_id AS TEXT))
        OR REPLACE(s.school_id, 'SCH-', '') = CAST(i.school_id AS TEXT)
      );
    `);
    console.log('✅ View `vw_esf7_school_node_progress` verified / created.');

    // 4. Create SQL Boolean View: vw_esf7_personnel_node_progress
    await pool.query(`
      CREATE OR REPLACE VIEW vw_esf7_personnel_node_progress AS
      SELECT
          p.school_id,
          p.school_year,
          p.personnel_id,
          p.personnel_name,
          p.position_title,
          p.category,
          p.is_school_head,
          
          -- Teacher Node Booleans
          COALESCE((p.node_03_room_qr->>'status') = 'COMPLETED', false)     AS is_room_qr_completed,
          COALESCE((p.node_04_profile->>'status') = 'COMPLETED', false)     AS is_profile_completed,
          COALESCE((p.node_07_designation->>'status') = 'COMPLETED', false) AS is_designation_completed,
          COALESCE((p.node_08_workload->>'status') = 'COMPLETED', false)    AS is_workload_completed,
          COALESCE((p.node_09_allowances->>'status') = 'COMPLETED', false)  AS is_allowances_completed,

          p.is_complete AS is_teacher_fully_completed,
          p.updated_at
      FROM esf7_personnel_node_status p;
    `);
    console.log('✅ View `vw_esf7_personnel_node_progress` verified / created.');

    console.log('🎉 [Migration Complete] All Node Status tables and views successfully established in insighted_esf7.');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrateNodeStatusTables();
