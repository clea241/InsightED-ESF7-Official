const db = require("./db");

async function run() {
  try {
    console.log(
      "Adding no_deped_email column to esf7_personnel_profile on insighted_esf7 and staging...",
    );
    await db.query(`
      ALTER TABLE esf7_personnel_profile 
      ADD COLUMN IF NOT EXISTS no_deped_email BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    console.log(
      "✅ Column no_deped_email added successfully to insighted_esf7!",
    );

    // Also run on staging pool
    await db.stagingPool.query(`
      ALTER TABLE esf7_personnel_profile 
      ADD COLUMN IF NOT EXISTS no_deped_email BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    console.log(
      "✅ Column no_deped_email added successfully to insighted_esf7_staging!",
    );
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    process.exit(0);
  }
}

run();
