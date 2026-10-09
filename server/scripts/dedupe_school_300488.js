// Cleanup for duplicated records of one school (default 300488).
//
//   node scripts/dedupe_school_300488.js                    REPORT ONLY - reads, never writes
//   node scripts/dedupe_school_300488.js --apply --confirm=300488
//                                                           snapshots, then dedupes inside one transaction
//
// What it looks at (natural keys):
//   school_drafts.payload.classSections  -> id, or grade level + section name
//   school_drafts.payload.personnel      -> id, or prn
//   esf7_workload_rows                   -> personnel + term + subject + grade + section (REPORTED for review;
//                                           only rows identical in every other column are ever deleted)
// The oldest/first copy of each group is kept; ids of dropped sections are repointed to the kept id.
// Refuses to run against anything that looks like a production database.

const db = require("../db");
const {
  dedupeSections,
  dedupePersonnel,
  sectionKeys,
} = require("../utils/draftDedupe");

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const SCHOOL = (flag("school") || "--school=300488").split("=")[1];
const YEAR = (flag("year") || "--year=SY 26-27").split("=")[1];
const APPLY = Boolean(flag("apply"));
const CONFIRMED = (flag("confirm") || "").split("=")[1] === SCHOOL;
const sidPair = [SCHOOL, `SCH-${SCHOOL}`];

function assertNotProduction() {
  const url =
    `${process.env.DATABASE_URL || ""} ${process.env.PGDATABASE || ""} ${process.env.NODE_ENV || ""}`.toLowerCase();
  if (/prod/.test(url))
    throw new Error("Refusing to run: environment looks like production.");
}

// Which section ids disappear when duplicates collapse, and which id survives.
function sectionIdRepointMap(list) {
  const keyToKeptId = new Map();
  const map = new Map();
  for (const s of list) {
    const keys = sectionKeys(s);
    const kept = keys.map((k) => keyToKeptId.get(k)).find(Boolean);
    if (!kept) {
      keys.forEach((k) => keyToKeptId.set(k, s.id));
      continue;
    }
    if (s.id != null && String(s.id) !== String(kept))
      map.set(String(s.id), String(kept));
    keys.forEach((k) => keyToKeptId.set(k, kept));
  }
  return map;
}

function groupsOf(list, keysOf) {
  const groups = new Map();
  for (const item of list) {
    const k = keysOf(item)[0];
    if (!k) continue;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  return [...groups].filter(([, n]) => n > 1);
}

async function main() {
  assertNotProduction();
  const draftRes = await db.query(
    "SELECT payload FROM school_drafts WHERE school_id = $1 AND school_year = $2",
    [SCHOOL, YEAR],
  );
  const payload = draftRes.rows[0] && draftRes.rows[0].payload;
  if (!payload) {
    console.log(`No draft found for ${SCHOOL} / ${YEAR}.`);
    return;
  }

  const secs = payload.classSections || [];
  const per = payload.personnel || [];
  const secClean = dedupeSections(secs);
  const perClean = dedupePersonnel(per);
  const repoint = sectionIdRepointMap(secs);

  const dupWl = await db.query(
    `SELECT personnel_id, term, subject, grade_level, section_name, COUNT(*)::int AS copies, ARRAY_AGG(id ORDER BY created_at, id) AS ids
       FROM esf7_workload_rows WHERE school_id = ANY($1)
      GROUP BY 1,2,3,4,5 HAVING COUNT(*) > 1 ORDER BY 1,2,3`,
    [sidPair],
  );

  console.log(`\n=== Duplicate report for school ${SCHOOL} (${YEAR}) ===`);
  console.log(
    `Class sections in draft : ${secs.length} stored -> ${secClean.length} unique  (${secs.length - secClean.length} duplicate copies)`,
  );
  console.log(
    `  duplicate groups      : ${groupsOf(secs, sectionKeys).length}`,
  );
  console.log(`  ids repointed         : ${repoint.size}`);
  console.log(
    `Personnel in draft      : ${per.length} stored -> ${perClean.length} unique  (${per.length - perClean.length} duplicate copies)`,
  );
  console.log(
    `Workload row groups repeating subject+section (REVIEW ONLY): ${dupWl.rows.length}`,
  );
  dupWl.rows.forEach((r) =>
    console.log(
      `  ${r.personnel_id} ${r.term} ${r.subject} ${r.grade_level} ${r.section_name} x${r.copies}`,
    ),
  );

  if (!APPLY) {
    console.log(
      "\nReport only - nothing was changed. To apply: --apply --confirm=" +
        SCHOOL,
    );
    return;
  }
  if (!CONFIRMED)
    throw new Error(
      `--apply needs --confirm=${SCHOOL} (typed by you after reviewing the report above).`,
    );

  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TABLE bak_school_drafts_${stamp} AS SELECT * FROM school_drafts WHERE school_id = $1 AND school_year = $2`,
      [SCHOOL, YEAR],
    );
    await client.query(
      `CREATE TABLE bak_workload_rows_${stamp} AS SELECT * FROM esf7_workload_rows WHERE school_id = ANY($1)`,
      [sidPair],
    );

    const next = { ...payload, classSections: secClean, personnel: perClean };
    if (repoint.size) {
      next.personnel = next.personnel.map((p) => ({
        ...p,
        workloadRows: Array.isArray(p.workloadRows)
          ? p.workloadRows.map((w) =>
              w && repoint.has(String(w.sectionId))
                ? { ...w, sectionId: repoint.get(String(w.sectionId)) }
                : w,
            )
          : p.workloadRows,
      }));
    }
    await client.query(
      "UPDATE school_drafts SET payload = $3, updated_at = NOW() WHERE school_id = $1 AND school_year = $2",
      [SCHOOL, YEAR, JSON.stringify(next)],
    );

    // Workload rows: delete only exact copies (every column equal except id/created_at/updated_at), keep the oldest.
    const cols = (
      await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'esf7_workload_rows' AND column_name NOT IN ('id','created_at','updated_at')`,
      )
    ).rows.map((r) => `"${r.column_name}"`);
    const del = await client.query(
      `DELETE FROM esf7_workload_rows w USING (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY ${cols.join(",")} ORDER BY created_at, id) AS rn
           FROM esf7_workload_rows WHERE school_id = ANY($1)
       ) d WHERE w.id = d.id AND d.rn > 1`,
      [sidPair],
    );
    await client.query("COMMIT");
    console.log(
      `\nApplied. Sections ${secs.length}->${secClean.length}, personnel ${per.length}->${perClean.length}, exact-copy workload rows deleted: ${del.rowCount}`,
    );
    console.log(
      `Snapshots: bak_school_drafts_${stamp}, bak_workload_rows_${stamp}`,
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
  });
