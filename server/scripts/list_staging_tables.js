const { stagingPool } = require("../db");

async function listTables() {
  const res = await stagingPool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log("Tables in insighted_esf7_staging:");
  console.log(res.rows.map((r) => r.table_name));
  process.exit(0);
}

listTables().catch(console.error);
