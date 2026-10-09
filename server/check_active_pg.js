const db = require("./db");
async function check() {
  try {
    const res = await db.query(`
      SELECT pid, usename, datname, now() - query_start as duration, state, query 
      FROM pg_stat_activity 
      WHERE state != 'idle' 
      ORDER BY duration DESC LIMIT 10
    `);
    console.log("Active queries in DB:", res.rows);
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    process.exit(0);
  }
}
check();
