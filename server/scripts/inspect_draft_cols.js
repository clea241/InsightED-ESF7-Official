const { stagingPool } = require('../db');

async function inspectDraftCols() {
  const res = await stagingPool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'school_drafts' 
    ORDER BY ordinal_position;
  `);
  console.log('Columns in school_drafts:');
  console.log(res.rows);
  process.exit(0);
}

inspectDraftCols().catch(console.error);
