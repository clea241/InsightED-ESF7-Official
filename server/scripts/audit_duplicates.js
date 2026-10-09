// READ-ONLY report of duplicate groups per proposed natural key (see utils/naturalKeys.js).
//   node scripts/audit_duplicates.js                 whole database
//   node scripts/audit_duplicates.js --school=300488 one school
// Writes nothing. Use it before scripts/dedupe_natural_keys.js and migrations/add_natural_key_constraints.js.

const db = require("../db");
const { NATURAL_KEYS, keyList } = require("../utils/naturalKeys");

const schoolArg = (
  process.argv.find((a) => a.startsWith("--school=")) || ""
).split("=")[1];

async function auditTable(k) {
  const where = [];
  const params = [];
  if (k.where) where.push(`(${k.where})`);
  if (schoolArg && k.schoolCol) {
    params.push(schoolArg, `SCH-${schoolArg}`);
    where.push(`${k.schoolCol} = ANY(ARRAY[$1, $2])`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `SELECT COUNT(*)::int AS groups, COALESCE(SUM(c - 1), 0)::int AS extra
                 FROM (SELECT COUNT(*) AS c FROM ${k.table} ${whereSql} GROUP BY ${keyList(k)} HAVING COUNT(*) > 1) g`;
  const r = await db.query(sql, params);
  return r.rows[0];
}

async function main() {
  console.log(
    `\n=== Duplicate audit${schoolArg ? ` for school ${schoolArg}` : " (whole database)"} - read only ===`,
  );
  let totalExtra = 0;
  for (const k of NATURAL_KEYS) {
    try {
      const { groups, extra } = await auditTable(k);
      totalExtra += extra;
      console.log(
        `${k.table.padEnd(38)} duplicate groups: ${String(groups).padStart(6)}   extra copies: ${String(extra).padStart(6)}   key: ${k.note}`,
      );
    } catch (e) {
      console.log(`${k.table.padEnd(38)} could not be audited: ${e.message}`);
    }
  }
  console.log(
    `\nTotal extra copies that would have to be removed before the unique indexes can be created: ${totalExtra}`,
  );
  console.log("Nothing was changed.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
  });
