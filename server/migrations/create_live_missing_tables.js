require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const db = require("../db");

/**
 * Migration: Create live tables that were previously only initialized on-the-fly in route handlers
 * - esf7_clustered_ghost_sync (requests controller)
 * - esf7_passcode_lockout (room_profiling controller)
 * - esf7_personnel_submission_archive (room_profiling controller)
 * - esf7_profiling_snapshots (room_profiling controller)
 * - esf7_validation (validation controller)
 * - esf7_link extra columns (esf7_upload controller)
 */
async function migrateLiveMissingTables() {
  console.log(
    "🚀 [Migration] Creating live missing tables across Primary and Staging...",
  );

  const pools = [
    { name: "Primary (insighted_esf7)", pool: db.getPool() },
    {
      name: "Staging (insighted_esf7_staging)",
      pool: db.getStagingPool ? db.getStagingPool() : null,
    },
  ].filter((p) => p.pool);

  for (const { name, pool } of pools) {
    try {
      await pool.query(`
        -- 1. esf7_clustered_ghost_sync
        CREATE TABLE IF NOT EXISTS esf7_clustered_ghost_sync (
          room_key TEXT NOT NULL,
          school_id TEXT NOT NULL,
          school_name TEXT,
          slots JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          PRIMARY KEY (room_key, school_id)
        );
        CREATE INDEX IF NOT EXISTS idx_clustered_ghost_room ON esf7_clustered_ghost_sync(room_key);

        -- 2. esf7_passcode_lockout (UNLOGGED for ephemeral rate-limiting)
        CREATE UNLOGGED TABLE IF NOT EXISTS esf7_passcode_lockout (
          lockout_key VARCHAR(128) PRIMARY KEY,
          school_id VARCHAR(64) NOT NULL,
          failed_attempts INT DEFAULT 0,
          lockout_until BIGINT DEFAULT 0,
          last_attempt_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_passcode_lockout_school ON esf7_passcode_lockout(school_id);

        -- 3. esf7_personnel_submission_archive
        CREATE TABLE IF NOT EXISTS esf7_personnel_submission_archive (
          id VARCHAR(128) PRIMARY KEY,
          school_id VARCHAR(64) NOT NULL,
          personnel_id VARCHAR(64) NOT NULL,
          personnel_name VARCHAR(255),
          room_name VARCHAR(255),
          status VARCHAR(32) DEFAULT 'APPROVED',
          payload_json JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          created_timestamp BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_pers_archive_school ON esf7_personnel_submission_archive(school_id);
        CREATE INDEX IF NOT EXISTS idx_pers_archive_personnel ON esf7_personnel_submission_archive(school_id, personnel_id);

        -- 4. esf7_profiling_snapshots
        CREATE TABLE IF NOT EXISTS esf7_profiling_snapshots (
          id VARCHAR(128) PRIMARY KEY,
          school_id VARCHAR(64) NOT NULL,
          snapshot_name VARCHAR(255),
          personnel_count INT DEFAULT 0,
          verified_count INT DEFAULT 0,
          snapshot_json JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_pers_snapshots_school ON esf7_profiling_snapshots(school_id);

        -- 5. esf7_validation
        CREATE TABLE IF NOT EXISTS esf7_validation (
          id SERIAL PRIMARY KEY,
          school_id VARCHAR(50) NOT NULL UNIQUE,
          school_year VARCHAR(50) DEFAULT 'SY 26-27',
          po3_validation TEXT DEFAULT 'PENDING',
          hrmo_validation TEXT DEFAULT 'PENDING',
          special_program_validation TEXT DEFAULT 'PENDING',
          sections_density_validation TEXT DEFAULT 'PENDING',
          staffing_composition_validation TEXT DEFAULT 'PENDING',
          validation_details JSONB DEFAULT '{}'::jsonb,
          validated_by JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_esf7_validation_school_id ON esf7_validation(school_id);

        -- 6. Ensure esf7_link columns match harvester & upload expectations
        CREATE TABLE IF NOT EXISTS esf7_link (
          school_id TEXT NOT NULL,
          semester TEXT NOT NULL DEFAULT 'REGULAR',
          iern TEXT,
          link TEXT NOT NULL DEFAULT '',
          file_path TEXT,
          row_count INTEGER,
          preview_data JSONB,
          summary JSONB,
          status TEXT DEFAULT 'QUEUED',
          audit_remarks TEXT,
          uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (school_id, semester)
        );
        ALTER TABLE esf7_link ADD COLUMN IF NOT EXISTS semester TEXT NOT NULL DEFAULT 'REGULAR';
        ALTER TABLE esf7_link ADD COLUMN IF NOT EXISTS iern TEXT;
        ALTER TABLE esf7_link ADD COLUMN IF NOT EXISTS file_path TEXT;
        ALTER TABLE esf7_link ADD COLUMN IF NOT EXISTS audit_remarks TEXT;
      `);
      console.log(`✅ Live tables verified & created in ${name}.`);
    } catch (err) {
      console.error(`❌ [Migration Error] Failed in ${name}:`, err.message);
      throw err;
    }
  }
}

if (require.main === module) {
  migrateLiveMissingTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrateLiveMissingTables };
