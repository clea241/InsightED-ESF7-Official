// READ-ONLY. Lists every row that points at a personnel profile which does not exist (orphans), and every row that
// is keyed by an ALIAS (legacy id / PRN) instead of the profile's own id. Changes nothing: the whole run is one
// READ ONLY transaction that is rolled back.
//
// It does not rely on a hand-written table list: every base table column named personnel_id, adviser_id, tutor_id,
// assigned_teacher_id, absent_personnel_id, relieving_personnel_id or school_head_id is checked, so a table added
// later is covered automatically. Also reports duplicate UUID profiles still present (the ones
// consolidate_and_backfill_personnel.js removes), leftover safety backups, and what the ID-mapping table points at.
//
// On the server:  ESF7_ECOSYSTEM=../ecosystem.esf7-staging.config.cjs node -r ./scripts/with_ecosystem_env.js scripts/check_personnel_orphans.js
// Exit code 0 = clean, 2 = orphans or alias-keyed rows found, 1 = could not run.
const path = require("path");

const serverDir = process.env.ESF7_SERVER_DIR
  ? path.resolve(process.env.ESF7_SERVER_DIR)
  : path.resolve(__dirname, "..");

// Same environment the running app gets (PM2 gives it the ecosystem env block). Works with or without the preload.
if (process.env.ESF7_ECOSYSTEM) {
  const eco = require(path.resolve(serverDir, process.env.ESF7_ECOSYSTEM));
  const app =
    (eco.apps || []).find((a) => a.env && !/worker/i.test(a.name || "")) || {};
  for (const [k, v] of Object.entries(app.env || {})) {
    if (v !== undefined && v !== null && v !== "") process.env[k] = String(v);
  }
}
// Direct Postgres connection (not PgBouncer) by default. ESF7_USE_POOLER=1 uses the app's own pooled connection instead:
// fine for this read-only check, and the only option before the direct-host setting (DB_DIRECT_HOST) is deployed.
if (!process.env.ESF7_USE_POOLER)
  require(path.join(serverDir, "db/directPort"));
const { pool } = require(path.join(serverDir, "db/index"));

const REF_COLUMNS = [
  "personnel_id",
  "adviser_id",
  "tutor_id",
  "assigned_teacher_id",
  "absent_personnel_id",
  "relieving_personnel_id",
  "school_head_id",
];
const UUID_RE =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const q = (ident) => `"${String(ident).replace(/"/g, '""')}"`;

async function main() {
  const client = await pool.connect();
  const report = { orphans: 0, aliasKeyed: 0, lines: [] };
  const say = (s = "") => {
    report.lines.push(s);
    console.log(s);
  };
  try {
    await client.query("BEGIN READ ONLY");

    const db = (
      await client.query(
        "SELECT current_database() AS db, current_setting('server_version') AS v",
      )
    ).rows[0];
    say(`Database: ${db.db} (PostgreSQL ${db.v})`);

    // ---- profiles ---------------------------------------------------------------------------------------------
    const prof = (
      await client.query(
        `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE id ~ '${UUID_RE}')::int AS uuid_style,
              COUNT(*) FILTER (WHERE id !~ '${UUID_RE}')::int AS plain_id
         FROM esf7_personnel_profile`,
      )
    ).rows[0];
    say(
      `\nProfiles: ${prof.total} total, ${prof.plain_id} with a plain id, ${prof.uuid_style} with a UUID id`,
    );

    const dup = (
      await client.query(
        `SELECT COUNT(*)::int AS n FROM (
         SELECT DISTINCT ON (u.id) u.id
           FROM esf7_personnel_profile o
           JOIN esf7_personnel_profile u
             ON o.school_id = u.school_id AND o.id <> u.id
            AND u.id ~ '${UUID_RE}' AND o.id !~ '${UUID_RE}'
            AND (u.legacy_id = o.id
                 OR (UPPER(TRIM(o.last_name)) = UPPER(TRIM(u.last_name))
                     AND UPPER(TRIM(o.first_name)) = UPPER(TRIM(u.first_name))))
          WHERE o.created_at <= u.created_at) d`,
      )
    ).rows[0].n;
    say(
      `Duplicate UUID profiles still present (what the consolidation removes): ${dup}`,
    );

    const backups = (
      await client.query(
        `SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name LIKE '\\_backup\\_esf7\\_personnel\\_%' ORDER BY table_name`,
      )
    ).rows.map((r) => r.table_name);
    say(
      `Consolidation safety backups present: ${backups.length ? backups.join(", ") : "none"}`,
    );

    if (
      (
        await client.query(
          "SELECT to_regclass('esf7_personnel_id_mapping') AS t",
        )
      ).rows[0].t
    ) {
      const m = (
        await client.query(
          `SELECT COUNT(*)::int AS n,
                COUNT(*) FILTER (WHERE status = 'consolidated')::int AS consolidated,
                COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM esf7_personnel_profile p WHERE p.id = m.new_id))::int AS dangling
           FROM esf7_personnel_id_mapping m`,
        )
      ).rows[0];
      say(
        `ID mapping: ${m.n} row(s), ${m.consolidated} consolidated, ${m.dangling} pointing at a profile that no longer exists`,
      );
      if (m.dangling > 0) report.orphans += m.dangling;
    }

    const hasMapping = Boolean(
      (
        await client.query(
          "SELECT to_regclass('esf7_personnel_id_mapping') AS t",
        )
      ).rows[0].t,
    );

    // ---- every column that references a person ----------------------------------------------------------------
    const cols = (
      await client.query(
        `SELECT c.table_name, c.column_name
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = current_schema()
          AND c.column_name = ANY($1::text[])
          AND c.table_name <> 'esf7_personnel_profile'
          AND c.table_name NOT LIKE '\\_backup\\_%'
          AND c.table_name NOT LIKE '%\\_backup\\_%'
        ORDER BY c.table_name, c.column_name`,
        [REF_COLUMNS],
      )
    ).rows;

    say(`\nChecking ${cols.length} person-reference column(s):`);
    say(
      `${"table.column".padEnd(52)} ${"rows".padStart(6)} ${"ok".padStart(6)} ${"alias".padStart(6)} ${"orphan".padStart(7)}  uuid-keys`,
    );
    for (const { table_name: t, column_name: col } of cols) {
      const T = q(t);
      const C = q(col);
      const r = (
        await client.query(
          `WITH x AS (
           SELECT ${C}::text AS k FROM ${T} WHERE ${C} IS NOT NULL AND ${C}::text <> ''
         ), y AS (
           SELECT k,
                  EXISTS (SELECT 1 FROM esf7_personnel_profile p WHERE p.id = x.k) AS canon,
                  EXISTS (SELECT 1 FROM esf7_personnel_profile p WHERE p.legacy_id = x.k OR p.prn = x.k) AS alias
             FROM x)
         SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE canon)::int AS ok,
                COUNT(*) FILTER (WHERE NOT canon AND alias)::int AS alias_only,
                COUNT(*) FILTER (WHERE NOT canon AND NOT alias)::int AS orphan,
                COUNT(*) FILTER (WHERE k ~ '${UUID_RE}')::int AS uuid_keys
           FROM y`,
        )
      ).rows[0];
      report.orphans += r.orphan;
      report.aliasKeyed += r.alias_only;
      let attribution = "";
      if (hasMapping && r.orphan > 0) {
        // Orphans whose key is a profile the consolidation removed (status 'consolidated'), and how many of those
        // can be pointed at the surviving canonical profile.
        const a = (
          await client.query(
            `SELECT COUNT(*)::int AS removed,
                    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM esf7_personnel_profile p WHERE p.id = m.new_id))::int AS repointable
               FROM ${T} x
               JOIN esf7_personnel_id_mapping m ON m.legacy_id = x.${C}::text AND m.status = 'consolidated'
              WHERE x.${C} IS NOT NULL AND x.${C}::text <> ''
                AND NOT EXISTS (SELECT 1 FROM esf7_personnel_profile p WHERE p.id = x.${C}::text)`,
          )
        ).rows[0];
        report.removedByConsolidation =
          (report.removedByConsolidation || 0) + a.removed;
        report.repointable = (report.repointable || 0) + a.repointable;
        attribution = `      of which keyed by a profile the consolidation removed: ${a.removed} (repointable to a surviving profile: ${a.repointable}); other orphans: ${r.orphan - a.removed}`;
      }
      const flag =
        r.orphan > 0
          ? "  <-- ORPHANS"
          : r.alias_only > 0
            ? "  <-- keyed by alias"
            : "";
      say(
        `${(t + "." + col).padEnd(52)} ${String(r.total).padStart(6)} ${String(r.ok).padStart(6)} ${String(r.alias_only).padStart(6)} ${String(r.orphan).padStart(7)}  ${r.uuid_keys}${flag}`,
      );
      if (attribution) say(attribution);
      if (r.orphan > 0 || r.alias_only > 0) {
        const sample = (
          await client.query(
            `SELECT DISTINCT ${C}::text AS k FROM ${T} x
            WHERE ${C} IS NOT NULL AND ${C}::text <> ''
              AND NOT EXISTS (SELECT 1 FROM esf7_personnel_profile p WHERE p.id = x.${C}::text)
            LIMIT 10`,
          )
        ).rows.map((s) => s.k);
        say(`      e.g. ${sample.join(", ")}`);
      }
    }

    say(
      `\nRESULT: ${report.orphans} orphan row(s), ${report.aliasKeyed} row(s) keyed by a legacy id / PRN instead of the profile id.`,
    );
    if (hasMapping) {
      say(
        `Attribution: ${report.removedByConsolidation || 0} orphan row(s) are keyed by a profile the consolidation removed (${report.repointable || 0} repointable); the other ${report.orphans - (report.removedByConsolidation || 0)} do not involve it.`,
      );
    }
    await client.query("ROLLBACK");
    process.exitCode = report.orphans > 0 || report.aliasKeyed > 0 ? 2 : 0;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("check_personnel_orphans failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module || process.env.ESF7_RUN_STDIN) main();
