const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function inspect() {
  try {
    // Full column list of esf7_database
    console.log('\n=== ALL COLUMNS OF esf7_database ===');
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'esf7_database' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    cols.rows.forEach(c => console.log(`  ${c.column_name.padEnd(40)} ${c.data_type}  [nullable: ${c.is_nullable}]`));

    // Row count
    const count = await pool.query(`SELECT COUNT(*) FROM esf7_database`);
    console.log(`\n→ Total rows: ${count.rows[0].count}`);

    // Distinct school count
    const schools = await pool.query(`SELECT COUNT(DISTINCT school_id) FROM esf7_database`);
    console.log(`→ Distinct schools: ${schools.rows[0].count}`);

    // Sample 10 random schools and their personnel counts
    console.log('\n=== SAMPLE 10 RANDOM SCHOOLS WITH PERSONNEL COUNT ===');
    const sample = await pool.query(`
      SELECT school_id, COUNT(*) as personnel_count
      FROM esf7_database
      WHERE school_id IS NOT NULL AND school_id != ''
      GROUP BY school_id
      HAVING COUNT(*) BETWEEN 5 AND 60
      ORDER BY RANDOM()
      LIMIT 10
    `);
    sample.rows.forEach(r => console.log(`  School ${r.school_id}: ${r.personnel_count} personnel`));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

inspect();
