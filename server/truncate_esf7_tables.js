const { pool } = require('./db');

async function truncateTables() {
  console.log('Truncating eSF7 transactional tables...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN;');

    const tablesToTruncate = [
      'workload_transfers',
      'workload_row_dates',
      'workload_rows',
      'class_sections',
      'personnel_trainings',
      'personnel_qualifications',
      'personnel_employment',
      'personnel',
      'school_drafts',
      'clustered_connections',
      'school_merger_registry'
    ];

    // Check if submission_queue exists
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' AND table_name='submission_queue';
    `);
    if (res.rows.length > 0) {
      tablesToTruncate.push('submission_queue');
    }

    const queryStr = `TRUNCATE TABLE ${tablesToTruncate.join(', ')} RESTART IDENTITY CASCADE;`;
    console.log('Executing:', queryStr);
    await client.query(queryStr);

    await client.query('COMMIT;');
    console.log('Successfully truncated all eSF7 tables!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Error truncating tables:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    process.exit();
  }
}

truncateTables();
