const db = require('e:/InsightED - ESF7 Official/server/db');

async function listProfileCols() {
  const res = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'esf7_personnel_profile'
    ORDER BY ordinal_position
  `);
  console.log('Columns in esf7_personnel_profile:', res.rows.map(r => r.column_name));
  process.exit(0);
}

listProfileCols();
