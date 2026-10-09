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
    for (const r of res.rows) {
      const t = r.table_name;
      try {
        const cnt = await client.query(`SELECT count(*) FROM "${t}"`);
        const hasSchool = await client.query(`
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = 'school_id'
        `, [t]);
        let schCnt = 'N/A';
        if (hasSchool.rows.length > 0) {
          const sc = await client.query(`SELECT count(*) FROM "${t}" WHERE school_id::text = '300488'`);
          schCnt = sc.rows[0].count;
        }
        console.log(t.padEnd(35) + ' total: ' + cnt.rows[0].count + ' | 300488: ' + schCnt);
      } catch (e) {
        console.log(t.padEnd(35) + ' error: ' + e.message);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    process.exit();
  }
}

listTables();
