const db = require('../db');

async function migrateDeletedPersonnelTable() {
  console.log('🚀 [Migration] Creating `esf7_deleted_personnel` table in insighted_esf7...');

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS esf7_deleted_personnel (
          id VARCHAR(128) PRIMARY KEY,
          school_id VARCHAR(64) NOT NULL,
          personnel_id VARCHAR(64),
          prn VARCHAR(64),
          employee_no VARCHAR(64),
          first_name VARCHAR(128),
          last_name VARCHAR(128),
          full_name_clean VARCHAR(256),
          deleted_by VARCHAR(128),
          deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_del_pers_school ON esf7_deleted_personnel(school_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_del_pers_prn ON esf7_deleted_personnel(prn);
      CREATE INDEX IF NOT EXISTS idx_esf7_del_pers_name ON esf7_deleted_personnel(school_id, full_name_clean);
    `);
    console.log('✅ Table `esf7_deleted_personnel` verified / created successfully.');
  } catch (err) {
    console.error('❌ [Migration Error] Failed to create `esf7_deleted_personnel` table:', err);
    throw err;
  }
}

if (require.main === module) {
  migrateDeletedPersonnelTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrateDeletedPersonnelTable };
