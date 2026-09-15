const { pool } = require('../db');

async function listTables() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name;
    `);
    console.log('Tables found (' + res.rows.length + '):');
    res.rows.forEach(r => console.log(' - ' + r.table_name));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    process.exit();
  }
}

listTables();
