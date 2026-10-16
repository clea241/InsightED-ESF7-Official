require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const db = require("../db");

async function inspectDeps() {
  const tables = ["school_drafts", "esf7_room_roster_cache"];
  for (const tbl of tables) {
    console.log(`\n=== Checking dependencies for ${tbl} ===`);
    const fks = await db
      .query(
        `
      SELECT conname, conrelid::regclass AS table_from, confrelid::regclass AS table_to, contype
      FROM pg_constraint
      WHERE confrelid = $1::regclass OR conrelid = $1::regclass
    `,
        [tbl],
      )
      .catch((e) => ({ rows: [] }));
    console.log("Constraints:", fks.rows);

    const views = await db
      .query(
        `
      SELECT viewname, definition
      FROM pg_views
      WHERE definition ILIKE '%' || $1 || '%' AND schemaname = 'public'
    `,
        [tbl],
      )
      .catch((e) => ({ rows: [] }));
    console.log("Views referencing table:", views.rows);

    const triggers = await db
      .query(
        `
      SELECT tgname, relname
      FROM pg_trigger JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
      WHERE relname = $1 AND NOT tgisinternal
    `,
        [tbl],
      )
      .catch((e) => ({ rows: [] }));
    console.log("Triggers:", triggers.rows);

    const count = await db
      .query(`SELECT count(*)::int AS n FROM ${tbl}`)
      .catch((e) => ({ rows: [{ n: e.message }] }));
    console.log("Row count:", count.rows[0].n);
  }

  // Check normalized coverage
  console.log("\n=== Checking school_drafts disaggregation coverage ===");
  const draftsCoverage = await db
    .query(
      `
    SELECT
      count(*)::int AS total_drafts,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM esf7_school_profile sp WHERE sp.school_id = sd.school_id OR sp.school_id = 'SCH-' || sd.school_id))::int AS in_school_profile,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM esf7_personnel_profile pp WHERE pp.school_id = sd.school_id OR pp.school_id = 'SCH-' || sd.school_id))::int AS in_personnel_profile,
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM esf7_school_profile sp WHERE sp.school_id = sd.school_id OR sp.school_id = 'SCH-' || sd.school_id)
                         AND NOT EXISTS (SELECT 1 FROM esf7_personnel_profile pp WHERE pp.school_id = sd.school_id OR pp.school_id = 'SCH-' || sd.school_id))::int AS unmigrated_schools
    FROM school_drafts sd
  `,
    )
    .catch((e) => ({ rows: [{ error: e.message }] }));
  console.log("school_drafts coverage:", draftsCoverage.rows[0]);
  const unmigratedList = await db
    .query(
      `
    SELECT sd.school_id, sd.school_year, length(sd.payload::text) as bytes, (sd.payload->>'school_id') as p_school_id, jsonb_array_length(COALESCE(sd.payload->'personnel', '[]'::jsonb)) as p_count
    FROM school_drafts sd
    WHERE NOT EXISTS (SELECT 1 FROM esf7_school_profile sp WHERE sp.school_id = sd.school_id OR sp.school_id = 'SCH-' || sd.school_id)
      AND NOT EXISTS (SELECT 1 FROM esf7_personnel_profile pp WHERE pp.school_id = sd.school_id OR pp.school_id = 'SCH-' || sd.school_id)
  `,
    )
    .catch((e) => ({ rows: [] }));
  console.log("7 Unmigrated school_drafts details:", unmigratedList.rows);

  console.log("\n=== Checking esf7_room_roster_cache coverage ===");
  const cacheCoverage = await db
    .query(
      `
    SELECT
      count(*)::int AS total_cached_schools,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM esf7_personnel_profile pp WHERE pp.school_id = rc.school_id OR pp.school_id = 'SCH-' || rc.school_id))::int AS schools_with_personnel,
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM esf7_personnel_profile pp WHERE pp.school_id = rc.school_id OR pp.school_id = 'SCH-' || rc.school_id))::int AS schools_without_personnel
    FROM esf7_room_roster_cache rc
  `,
    )
    .catch((e) => ({ rows: [{ error: e.message }] }));
  console.log("esf7_room_roster_cache coverage:", cacheCoverage.rows[0]);

  process.exit(0);
}

inspectDeps().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
