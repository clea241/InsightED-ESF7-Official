const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Connect to insightEd database (read-only inspection)
const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function inspect() {
  try {
    console.log('\n=== TABLES IN insightEd DATABASE ===');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    tables.rows.forEach(r => console.log(' -', r.table_name));

    // Check if esf7_database table exists
    const esf7Check = tables.rows.find(r => r.table_name === 'esf7_database');
    if (!esf7Check) {
      console.log('\n⚠️  Table "esf7_database" NOT FOUND in insightEd.');
      console.log('Listing similar tables that contain "esf7" in name...');
      const similar = tables.rows.filter(r => r.table_name.toLowerCase().includes('esf7'));
      if (similar.length === 0) {
        console.log('  (none found)');
      } else {
        similar.forEach(r => console.log(' -', r.table_name));
      }
    } else {
      console.log('\n✅ Found "esf7_database" table!');
    }

    // Show columns for any ESF7-related tables
    const esf7Tables = tables.rows.filter(r =>
      r.table_name.toLowerCase().includes('esf7') ||
      r.table_name.toLowerCase().includes('sf7')
    );

    for (const t of esf7Tables) {
      console.log(`\n=== COLUMNS OF "${t.table_name}" ===`);
      const cols = await pool.query(`
        SELECT column_name, data_type, is_nullable, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [t.table_name]);
      cols.rows.forEach(c => {
        const len = c.character_maximum_length ? `(${c.character_maximum_length})` : '';
        console.log(`  ${c.column_name.padEnd(35)} ${c.data_type}${len}  [nullable: ${c.is_nullable}]`);
      });

      // Show row count
      const count = await pool.query(`SELECT COUNT(*) FROM "${t.table_name}"`);
      console.log(`  → Total rows: ${count.rows[0].count}`);

      // Show 2 sample rows
      const sample = await pool.query(`SELECT * FROM "${t.table_name}" LIMIT 2`);
      console.log(`  → Sample rows:`);
      sample.rows.forEach((row, i) => console.log(`    [${i+1}]`, JSON.stringify(row, null, 2)));
    }

    process.exit(0);
  } catch (err) {
    console.error('Error inspecting database:', err.message);
    process.exit(1);
  }
}

inspect();
