const path = require('path');
const { Pool } = require(path.join(__dirname, '../node_modules/pg'));
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'insighted_esf7',
  ssl: { rejectUnauthorized: false }
});

async function verify() {
  const count = await pool.query('SELECT count(*)::bigint as total FROM "esf7_database_2.0";');
  const sample = await pool.query('SELECT * FROM "esf7_database_2.0" LIMIT 2;');
  const cols = await pool.query("SELECT count(*)::int as count FROM information_schema.columns WHERE table_name = 'esf7_database_2.0';");
  const pkey = await pool.query(`
    SELECT ccu.column_name 
    FROM information_schema.table_constraints tc 
    JOIN information_schema.constraint_column_usage AS ccu 
      ON ccu.constraint_schema = tc.constraint_schema AND ccu.constraint_name = tc.constraint_name 
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = 'esf7_database_2.0';
  `);
  const size = await pool.query('SELECT pg_size_pretty(pg_total_relation_size(\'"esf7_database_2.0"\')) as total_size;');
  
  console.log(JSON.stringify({
    totalRows: count.rows[0].total,
    columnCount: cols.rows[0].count,
    primaryKey: pkey.rows.map(r => r.column_name),
    totalTableSize: size.rows[0].total_size,
    firstRowId: sample.rows[0].id,
    firstRowEsf7Id: sample.rows[0].esf7_id,
    firstRowOldId: sample.rows[0].old_id,
    firstRowSchoolId: sample.rows[0].school_id,
    firstRowName: sample.rows[0].last_first
  }, null, 2));

  await pool.end();
}

verify().catch(console.error);
