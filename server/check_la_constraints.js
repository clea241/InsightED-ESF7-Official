const db = require('e:/InsightED - ESF7 Official/server/db');

async function checkConstraints() {
  const res = await db.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'esf7_personnel_learning_areas'::regclass
  `);
  console.log('Constraints on esf7_personnel_learning_areas:', res.rows);
  process.exit(0);
}

checkConstraints();
