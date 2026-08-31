const db = require('./db');

async function run() {
  try {
    const r = await db.query(
      `SELECT id, school_id, school_year, status, error_message, created_at, updated_at
       FROM esf7_submission_queue ORDER BY id DESC LIMIT 10`
    );
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error(e.message);
  }
  process.exit(0);
}
run();
