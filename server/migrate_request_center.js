const db = require('./db');

async function migrate() {
  try {
    console.log('Running migrations for Clustered Connections and School Mergers...');

    // 1. Create clustered_connections
    await db.query(`
      CREATE TABLE IF NOT EXISTS clustered_connections (
          id SERIAL PRIMARY KEY,
          requester_school_id TEXT NOT NULL,
          target_school_id TEXT NOT NULL,
          personnel_id TEXT,
          personnel_name TEXT,
          request_type TEXT NOT NULL CHECK (request_type IN ('clustered_teacher', 'school_merger')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Create school_merger_registry
    await db.query(`
      CREATE TABLE IF NOT EXISTS school_merger_registry (
          id SERIAL PRIMARY KEY,
          parent_school_id TEXT NOT NULL,
          child_school_id TEXT NOT NULL,
          merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 3. Add columns to school_drafts if needed or support in schema
    // Let's make sure indexes exist for optimization
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_clustered_connections_target ON clustered_connections (target_school_id, status);
      CREATE INDEX IF NOT EXISTS idx_clustered_connections_requester ON clustered_connections (requester_school_id);
      CREATE INDEX IF NOT EXISTS idx_school_merger_registry_child ON school_merger_registry (child_school_id);
    `);

    console.log('✅ Request Center migrations applied successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
