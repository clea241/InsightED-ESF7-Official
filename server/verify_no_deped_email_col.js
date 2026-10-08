const db = require('./db');

async function test() {
  try {
    console.log('Testing no_deped_email column on esf7_personnel_profile...');
    const res = await db.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'esf7_personnel_profile' AND column_name IN ('deped_email', 'no_deped_email');
    `);
    console.log('Columns verified:', res.rows);
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    process.exit(0);
  }
}

test();
