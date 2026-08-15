const db = require('./db');

async function main() {
  try {
    console.log('🧹 Cleaning up duplicate dummy records in personnel table...');
    await db.query(`DELETE FROM personnel WHERE school_id LIKE '1999%' OR school_id = '199888' OR school_id IS NULL`);
    console.log('✅ Personnel table cleaned up successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error cleaning up personnel:', err);
    process.exit(1);
  }
}

main();
