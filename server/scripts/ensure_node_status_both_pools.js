const db = require("../db");

async function ensureNodeStatusTables() {
  const pools = [
    { name: "insighted_esf7 (Prod/Primary)", pool: db.getProdPool() },
    { name: "insighted_esf7_staging (Staging)", pool: db.getStagingPool() },
  ];

  for (const { name, pool } of pools) {
    console.log(`Checking / Migrating node status tables in ${name}...`);
    try {
      // 1. Create esf7_school_node_status
      await pool.query(`
        CREATE TABLE IF NOT EXISTS esf7_school_node_status (
            school_id VARCHAR(255) NOT NULL,
            school_year VARCHAR(50) NOT NULL DEFAULT 'SY 26-27',
            overall_status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS',
            overall_percentage INTEGER NOT NULL DEFAULT 0,
            
            node_01_school JSONB NOT NULL DEFAULT '{}'::jsonb,
            node_02_roster JSONB NOT NULL DEFAULT '{}'::jsonb,
            node_05_requests JSONB NOT NULL DEFAULT '{}'::jsonb,
            node_06_classes JSONB NOT NULL DEFAULT '{}'::jsonb,
            node_10_overload JSONB NOT NULL DEFAULT '{}'::jsonb,
            node_11_validation JSONB NOT NULL DEFAULT '{}'::jsonb,
            
            personnel_summary JSONB NOT NULL DEFAULT '{"total_personnel":0,"profiling_completed":0,"workload_completed":0,"all_personnel_ready":false}'::jsonb,
            
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            CONSTRAINT pk_esf7_school_node_status_${name.includes("staging") ? "staging" : "prod"} PRIMARY KEY (school_id, school_year)
        );

        CREATE INDEX IF NOT EXISTS idx_school_node_status_lookup_${name.includes("staging") ? "stg" : "prd"} ON esf7_school_node_status (school_id, school_year);
        CREATE INDEX IF NOT EXISTS idx_school_node_status_overall_${name.includes("staging") ? "stg" : "prd"} ON esf7_school_node_status (overall_status);
        CREATE INDEX IF NOT EXISTS idx_school_node_status_gin_${name.includes("staging") ? "stg" : "prd"} ON esf7_school_node_status USING GIN (personnel_summary, node_11_validation);
      `);
      console.log(`  ✓ Table esf7_school_node_status verified in ${name}`);

      // 2. Create esf7_personnel_node_status
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
            
            node_03_room_qr JSONB NOT NULL DEFAULT '{}'::jsonb,
            node_04_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
            node_07_designation JSONB NOT NULL DEFAULT '{}'::jsonb,
            node_08_workload JSONB NOT NULL DEFAULT '{}'::jsonb,
            node_09_allowances JSONB NOT NULL DEFAULT '{}'::jsonb,
            
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            CONSTRAINT pk_esf7_personnel_node_status_${name.includes("staging") ? "staging" : "prod"} PRIMARY KEY (school_id, school_year, personnel_id)
        );

        CREATE INDEX IF NOT EXISTS idx_personnel_node_status_lookup_${name.includes("staging") ? "stg" : "prd"} ON esf7_personnel_node_status (school_id, school_year, personnel_id);
        CREATE INDEX IF NOT EXISTS idx_personnel_node_status_complete_${name.includes("staging") ? "stg" : "prd"} ON esf7_personnel_node_status (school_id, is_complete);
      `);
      console.log(`  ✓ Table esf7_personnel_node_status verified in ${name}`);

      // 3. Ensure schools_iern
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
      `);
      console.log(`  ✓ Table schools_iern verified in ${name}`);
    } catch (err) {
      console.error(`  ❌ Error in ${name}:`, err.message);
    }
  }

  process.exit(0);
}

ensureNodeStatusTables();
