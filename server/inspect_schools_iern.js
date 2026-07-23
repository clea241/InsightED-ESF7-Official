const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
    : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function inspect() {
  try {
    // 1. Find schools_IERN table (case-insensitive search)
    console.log('\n=== SEARCHING FOR schools_IERN TABLE ===');
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND LOWER(table_name) LIKE '%iern%'
      ORDER BY table_name
    `);
    tables.rows.forEach(r => console.log(' -', r.table_name));

    // 2. Show columns of the found table
    for (const t of tables.rows) {
      console.log(`\n=== COLUMNS OF "${t.table_name}" ===`);
      const cols = await pool.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [t.table_name]);
      cols.rows.forEach(c => console.log(`  ${c.column_name.padEnd(40)} ${c.data_type}`));

      const count = await pool.query(`SELECT COUNT(*) FROM "${t.table_name}"`);
      console.log(`\n→ Total rows: ${count.rows[0].count}`);

      // 3. Sample rows
      const sample = await pool.query(`SELECT * FROM "${t.table_name}" LIMIT 5`);
      console.log('\n→ Sample rows:');
      sample.rows.forEach((r, i) => console.log(`  [${i+1}]`, JSON.stringify(r)));

      // 4. Check school_id prefix vs curricular offering
      console.log(`\n=== SCHOOL_ID PREFIX DISTRIBUTION ===`);
      const prefixRes = await pool.query(`
        SELECT LEFT(school_id::TEXT, 1) as prefix, COUNT(*) as count
        FROM "${t.table_name}"
        WHERE school_id IS NOT NULL
        GROUP BY LEFT(school_id::TEXT, 1)
        ORDER BY prefix
      `).catch(() => null);
      if (prefixRes) prefixRes.rows.forEach(r => console.log(`  Prefix "${r.prefix}": ${r.count} schools`));

      // 5. Look for curricular offering column
      const curricCol = cols.rows.find(c =>
        c.column_name.toLowerCase().includes('curricular') ||
        c.column_name.toLowerCase().includes('offering') ||
        c.column_name.toLowerCase().includes('offering_type') ||
        c.column_name.toLowerCase().includes('school_type')
      );
      if (curricCol) {
        console.log(`\n=== DISTINCT VALUES OF "${curricCol.column_name}" ===`);
        const vals = await pool.query(`
          SELECT "${curricCol.column_name}", COUNT(*) FROM "${t.table_name}" 
          GROUP BY "${curricCol.column_name}" ORDER BY COUNT(*) DESC LIMIT 20
        `);
        vals.rows.forEach(r => console.log(`  ${String(r[curricCol.column_name]).padEnd(50)} ${r.count}`));
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

inspect();
