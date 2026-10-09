// Removes DUPLICATE rows (same natural key, see utils/naturalKeys.js), keeping the oldest copy of each group.
//   node scripts/dedupe_natural_keys.js --table=esf7_workload_rows                       REPORT ONLY
//   node scripts/dedupe_natural_keys.js --table=esf7_workload_rows --school=300488        REPORT ONLY for one school
//   node scripts/dedupe_natural_keys.js --table=esf7_workload_rows --school=300488 --apply --confirm=esf7_workload_rows
// --apply needs --confirm=<the same table name>, snapshots the table first (bak_<table>_<timestamp>) and deletes inside
// one transaction. Refuses to run when the environment looks like production. Run it table by table, after reviewing the report.

const db = require('../db');
const { NATURAL_KEYS, keyList } = require('../utils/naturalKeys');

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const table = arg('table');
const school = arg('school');
const APPLY = process.argv.includes('--apply');
const CONFIRMED = arg('confirm') === table;

async function main() {
  if (/prod/.test(`${process.env.DATABASE_URL || ''} ${process.env.DB_NAME || ''} ${process.env.NODE_ENV || ''}`.toLowerCase())) {
    throw new Error('Refusing to run: environment looks like production.');
  }
  const k = NATURAL_KEYS.find((x) => x.table === table);
  if (!k) throw new Error(`--table must be one of: ${NATURAL_KEYS.map((x) => x.table).join(', ')}`);

  const where = [];
  const params = [];
  if (k.where) where.push(`(${k.where})`);
  if (school && k.schoolCol) { params.push(school, `SCH-${school}`); where.push(`${k.schoolCol} = ANY(ARRAY[$1, $2])`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const ranked = `SELECT id, ROW_NUMBER() OVER (PARTITION BY ${keyList(k)} ORDER BY created_at, id) AS rn FROM ${k.table} ${whereSql}`;
  const rep = await db.query(`SELECT COUNT(*)::int AS extra FROM (${ranked}) r WHERE rn > 1`, params);
  const groups = await db.query(`SELECT COUNT(*)::int AS groups FROM (SELECT 1 FROM ${k.table} ${whereSql} GROUP BY ${keyList(k)} HAVING COUNT(*) > 1) g`, params);
  console.log(`\n${k.table}${school ? ` (school ${school})` : ''}: ${groups.rows[0].groups} duplicate group(s), ${rep.rows[0].extra} extra copy/copies would be deleted (oldest of each group kept).`);

  if (!APPLY) { console.log('REPORT ONLY - nothing changed. To apply: add --apply --confirm=' + table); return; }
  if (!CONFIRMED) throw new Error(`--apply needs --confirm=${table} (typed after reviewing the report above).`);
  if (rep.rows[0].extra === 0) { console.log('Nothing to delete.'); return; }

  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE bak_${k.table}_${stamp} AS SELECT * FROM ${k.table}`);
    const del = await client.query(`DELETE FROM ${k.table} t USING (${ranked}) r WHERE t.id = r.id AND r.rn > 1`, params);
    await client.query('COMMIT');
    console.log(`Deleted ${del.rowCount} duplicate row(s). Snapshot: bak_${k.table}_${stamp}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
