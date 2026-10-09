const { stagingPool } = require("../db");

async function inspectProfileCols() {
  const res = await stagingPool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'esf7_school_profile' 
    ORDER BY ordinal_position;
  `);
  console.log("Columns in esf7_school_profile:");
  console.log(res.rows);
  process.exit(0);
}

inspectProfileCols().catch(console.error);
