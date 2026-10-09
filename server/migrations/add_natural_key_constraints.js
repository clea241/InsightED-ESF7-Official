// Adds the UNIQUE indexes from utils/naturalKeys.js so duplicates can never be inserted again.
//   node migrations/add_natural_key_constraints.js            CHECK ONLY (default): lists what blocks each index
//   node migrations/add_natural_key_constraints.js --apply --confirm=YES
// It never deletes anything. A table that still has duplicate groups is SKIPPED with the count, so clean it first with
// scripts/dedupe_natural_keys.js (report -> confirm -> snapshot -> delete). Safe to re-run (IF NOT EXISTS). Back up first.

const db = require('../db');
const { NATURAL_KEYS, keyList } = require('../utils/naturalKeys');

const APPLY = process.argv.includes('--apply');
const CONFIRMED = process.argv.includes('--confirm=YES');

async function main() {
  if (APPLY && !CONFIRMED) throw new Error('--apply needs --confirm=YES (after a backup and a clean duplicate audit).');
  console.log(`\n=== Natural-key unique indexes - ${APPLY ? 'APPLY' : 'check only'} ===`);
  let created = 0;
  let blocked = 0;
  for (const k of NATURAL_KEYS) {
    try {
      const where = k.where ? `WHERE ${k.where}` : '';
      const dup = await db.query(`SELECT COUNT(*)::int AS groups FROM (SELECT 1 FROM ${k.table} ${where} GROUP BY ${keyList(k)} HAVING COUNT(*) > 1) g`);
      const groups = dup.rows[0].groups;
      if (groups > 0) {
        blocked++;
        console.log(`SKIP  ${k.table}: ${groups} duplicate group(s) block ${k.index}. Run scripts/dedupe_natural_keys.js --table=${k.table} first.`);
        continue;
      }
      if (!APPLY) { console.log(`READY ${k.table}: no duplicates, ${k.index} can be created.`); continue; }
      await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${k.index} ON ${k.table} (${keyList(k)}) ${where}`);
      created++;
      console.log(`OK    ${k.table}: ${k.index} created (or already present).`);
    } catch (e) {
      blocked++;
      console.log(`ERROR ${k.table}: ${e.message}`);
    }
  }
  console.log(`\n${APPLY ? `${created} index(es) ensured, ` : ''}${blocked} table(s) blocked.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
