const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/users_database`,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const res = await pool.query(`
    SELECT school_id, email, passcode, password_hash
    FROM user_schoolhead 
    WHERE school_id IN ('800001', '305202', '101190', '199888', '199999')
       OR passcode IS NOT NULL 
    LIMIT 15
  `);
  console.log('Sample user_schoolhead records:');
  console.table(res.rows.map(r => ({
    school_id: r.school_id,
    email: r.email,
    passcode: r.passcode,
    passcode_len: r.passcode ? r.passcode.length : null,
    has_hash: !!r.password_hash
  })));

  const stats = await pool.query(`
    SELECT LENGTH(passcode) as len, COUNT(*) 
    FROM user_schoolhead 
    GROUP BY LENGTH(passcode) 
    ORDER BY count DESC
    LIMIT 10;
  `);
  console.log('\nPasscode length distribution:');
  console.table(stats.rows);

  await pool.end();
}
run();
