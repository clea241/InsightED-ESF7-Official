const db = require('./db');

async function run() {
  try {
    // Reset stuck 'processing' jobs back to 'pending' so the worker picks them up again
    const r = await db.query(
      `UPDATE submission_queue 
       SET status = 'pending', updated_at = NOW()
       WHERE status = 'processing'
       RETURNING id, school_id, school_year`
    );
    if (r.rows.length > 0) {
      console.log('✅ Reset stuck jobs to pending:', r.rows);
    } else {
      console.log('No stuck jobs found.');
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
run();
