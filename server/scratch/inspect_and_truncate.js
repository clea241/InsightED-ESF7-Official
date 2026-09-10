const { pool } = require('../db');

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name;
    `);
    console.log('Base tables in insighted_esf7 public schema:');
    res.rows.forEach(r => console.log(' - ' + r.table_name));

    // Exclude salary_matrix
    const tablesToTruncate = res.rows
      .map(r => r.table_name)
      .filter(name => name.toLowerCase() !== 'salary_matrix');

    console.log(`\nBase tables to truncate (${tablesToTruncate.length} tables, excluding salary_matrix):`);
    tablesToTruncate.forEach(t => console.log(' - ' + t));

    if (tablesToTruncate.length === 0) {
      console.log('No tables to truncate.');
      return;
    }

    await client.query('BEGIN;');
    const truncateQuery = `TRUNCATE TABLE ${tablesToTruncate.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`;
    console.log('\nExecuting Truncate Statement...');
    await client.query(truncateQuery);
    await client.query('COMMIT;');

    console.log('\n=============================================');
    console.log('TRUNCATE COMPLETED SUCCESSFULLY FOR insighted_esf7!');
    console.log('=============================================');

    // Verify row counts
    console.log('\nRow count verification:');
    for (const t of res.rows.map(r => r.table_name)) {
      const countRes = await client.query(`SELECT COUNT(*) FROM "${t}"`);
      console.log(` - ${t}: ${countRes.rows[0].count} rows`);
    }
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Error during truncate:', err);
  } finally {
    client.release();
    process.exit();
  }
}

main();
