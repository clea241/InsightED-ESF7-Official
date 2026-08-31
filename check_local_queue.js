const db = require('./server/db');

async function checkQueue() {
  try {
    const res = await db.query('SELECT * FROM esf7_personnel_submission');
    console.log('=== LOCAL DB: esf7_personnel_submission rows ===');
    console.log('Total count:', res.rows.length);
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkQueue();
