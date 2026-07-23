const db = require('./db');
async function run() {
  try {
    const res = await db.query("SELECT * FROM personnel WHERE school_id = '123458'");
    console.log("School 123458 personnel:");
    res.rows.forEach(r => console.log(`${r.salutation} ${r.first_name} ${r.last_name}`));
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
run();
