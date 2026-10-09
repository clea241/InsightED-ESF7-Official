const { prodPool } = require("../db");

async function checkAll() {
  const res = await prodPool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  console.log("--- ALL TABLES AND COUNTS IN insighted_esf7 ---");
  for (const row of res.rows) {
    try {
      const c = await prodPool.query(
        `SELECT count(*)::int as count FROM "${row.table_name}"`,
      );
      console.log(`${row.table_name.padEnd(35)}: ${c.rows[0].count} rows`);
    } catch (e) {
      console.log(`${row.table_name.padEnd(35)}: ERROR (${e.message})`);
    }
  }
  await prodPool.end();
}

checkAll().catch(console.error);
