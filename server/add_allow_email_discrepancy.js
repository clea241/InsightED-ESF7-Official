const db = require('./db');

async function run() {
  try {
    console.log('Adding allow_email_discrepancy column to esf7_personnel_profile on insighted_esf7 and staging...');
    await db.query(`
      ALTER TABLE esf7_personnel_profile 
      ADD COLUMN IF NOT EXISTS allow_email_discrepancy BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    console.log('✅ Column allow_email_discrepancy added successfully to insighted_esf7!');

    // Also run on staging pool if available
    if (db.stagingPool) {
      await db.stagingPool.query(`
        ALTER TABLE esf7_personnel_profile 
        ADD COLUMN IF NOT EXISTS allow_email_discrepancy BOOLEAN NOT NULL DEFAULT FALSE;
      `);
      console.log('✅ Column allow_email_discrepancy added successfully to insighted_esf7_staging!');
    }
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    process.exit(0);
  }
}

run();
