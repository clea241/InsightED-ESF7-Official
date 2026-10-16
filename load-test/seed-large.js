#!/usr/bin/env node
"use strict";
// Synthetic data generator for the LOCAL load-test database. Fake names only; never reads or copies real data.
// Scales to load-test/load-model.json "largest_tenant_targets" (one big school) plus "other_tenants" (many small ones), and
// writes synthetic account tokens to LOAD_TEST_ACCOUNTS_FILE.
// Usage: node load-test/seed-large.js          (idempotent: only tops up missing rows)
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const req = createRequire(path.join(root, "server", "package.json"));
const { Client } = req("pg");
const jwt = req("jsonwebtoken");

function parseEnv(file) {
  const out = {};
  let t = "";
  try {
    t = fs.readFileSync(file, "utf8");
  } catch {
    return {};
  }
  for (const l of t.split(/\r?\n/)) {
    const m = l.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (m && !l.trim().startsWith("#"))
      out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
const env = parseEnv(path.join(root, ".env.load"));
const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';

(async () => {
  let u;
  try {
    u = new URL(env.LOAD_DATABASE_URL);
  } catch {
    console.error("LOAD_DATABASE_URL missing in .env.load");
    process.exit(2);
  }
  const dbName = decodeURIComponent(u.pathname.slice(1)).toLowerCase();
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname) ||
    !dbName.includes("test") ||
    /^drill_/.test(dbName)
  ) {
    console.error(
      'REFUSED: seeding is only allowed in a local database whose name contains "test" (and is not drill_*).',
    );
    process.exit(2);
  }
  const model = JSON.parse(
    fs.readFileSync(path.join(root, "load-test", "load-model.json"), "utf8"),
  );
  const T = model.largest_tenant_targets;
  const others = model.other_tenants || { count: 0, rows_per_table: {} };
  const col = T.tenant_column || "school_id";
  const SY = "SY 26-27";
  const c = new Client({ connectionString: env.LOAD_DATABASE_URL });
  await c.connect();

  // 1. Schema: apply schema.sql and drizzle schema to ensure complete DB definitions
  const schemaFile = path.join(root, "server", "schema.sql");
  if (fs.existsSync(schemaFile)) {
    const rawSql = fs.readFileSync(schemaFile, "utf8");
    const stmts = rawSql
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 5);
    for (const stmt of stmts) {
      try {
        await c.query(stmt);
      } catch (e) {
        // ignore idempotent creation errors
      }
    }
  }
  // Apply missing section and auxiliary tables
  for (const stmt of [
    "ALTER TABLE esf7_perssonel_educ ADD COLUMN IF NOT EXISTS college_degrees jsonb",
    "ALTER TABLE esf7_workload_rows ADD COLUMN IF NOT EXISTS extras jsonb DEFAULT '{}'::jsonb",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS iern TEXT",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_elem_special_programs BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS elem_special_programs JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_jhs_special_programs BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS jhs_special_programs JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS shs_curriculum_model TEXT DEFAULT 'Standard K-12 SHS Curriculum'",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_es_sned BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_es_als BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_es_iped BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_es_mad BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_jhs_sned BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_jhs_als BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_jhs_iped BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_jhs_mad BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_shs_sned BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_shs_iped BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_shs_mad BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_sned BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_als BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_iped BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_madrasah BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS inclusive_programs JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_shifts BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_personnel_profile ADD COLUMN IF NOT EXISTS allow_email_discrepancy BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_personnel_profile ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'canonical'",
    "ALTER TABLE esf7_personnel_profile ADD COLUMN IF NOT EXISTS legacy_id VARCHAR(128)",
    "ALTER TABLE esf7_personnel_profile ADD COLUMN IF NOT EXISTS no_deped_email BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_personnel_profile ADD COLUMN IF NOT EXISTS is_main_sh BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE esf7_regular_sections ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE esf7_sned_sections ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE esf7_als_sections ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE esf7_aral_sections ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE esf7_remedial_enrichment_sections ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '{}'::jsonb",
    `CREATE TABLE IF NOT EXISTS esf7_sned_sections (
      id VARCHAR(50) PRIMARY KEY,
      school_id TEXT NOT NULL,
      school_year TEXT NOT NULL DEFAULT '2026-2027',
      grade_level TEXT NOT NULL DEFAULT 'SNED (NON-GRADED)',
      section_name TEXT NOT NULL,
      program_type TEXT,
      adviser_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
      male_learners INTEGER DEFAULT 0,
      female_learners INTEGER DEFAULT 0,
      number_of_learners INTEGER DEFAULT 0,
      size_status TEXT DEFAULT 'WITHIN STANDARD',
      raw_payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_sned_section_school_sy UNIQUE (school_id, school_year, section_name)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_sned_sections_school_sy ON esf7_sned_sections (school_id, school_year)",
    "CREATE INDEX IF NOT EXISTS idx_sned_sections_adviser ON esf7_sned_sections (adviser_id)",
    `CREATE TABLE IF NOT EXISTS esf7_als_sections (
      id VARCHAR(50) PRIMARY KEY,
      school_id TEXT NOT NULL,
      school_year TEXT NOT NULL DEFAULT '2026-2027',
      grade_level TEXT NOT NULL DEFAULT 'ALS',
      section_name TEXT NOT NULL,
      delivery_mode TEXT,
      clc_name TEXT,
      adviser_id VARCHAR(50) REFERENCES esf7_personnel_profile(id) ON DELETE SET NULL,
      male_learners INTEGER DEFAULT 0,
      female_learners INTEGER DEFAULT 0,
      number_of_learners INTEGER DEFAULT 0,
      size_status TEXT DEFAULT 'WITHIN STANDARD',
      raw_payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_als_section_school_sy UNIQUE (school_id, school_year, section_name)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_als_sections_school_sy ON esf7_als_sections (school_id, school_year)",
    "CREATE INDEX IF NOT EXISTS idx_als_sections_adviser ON esf7_als_sections (adviser_id)",
    "ALTER TABLE esf7_database ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false",
    "ALTER TABLE esf7_database_dummy ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false",
    `CREATE TABLE IF NOT EXISTS unit1_school_identity (
      school_id TEXT PRIMARY KEY,
      school_name TEXT,
      division TEXT,
      region TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ]) {
    try {
      await c.query(stmt);
    } catch (e) {
      console.log("  compat note: " + e.message.split("\n")[0]);
    }
  }

  // 1b. Fail loudly if any required table is missing
  const REQUIRED_TABLES = [
    "esf7_personnel_profile",
    "esf7_school_profile",
    "esf7_regular_sections",
    "esf7_sned_sections",
    "esf7_als_sections",
    "esf7_aral_sections",
    "esf7_remedial_enrichment_sections",
    "esf7_workload_rows",
    "school_drafts",
  ];
  const missing = [];
  for (const t of REQUIRED_TABLES) {
    const r = await c.query("SELECT to_regclass($1) AS r", [t]);
    if (!r.rows[0].r) missing.push(t);
  }
  if (missing.length > 0) {
    console.error(
      "❌ FATAL: Required tables missing in test database: " +
        missing.join(", "),
    );
    process.exit(1);
  }

  // 1c. Verify required columns in key tables
  const REQUIRED_COLUMNS = {
    esf7_school_profile: [
      "iern",
      "elem_special_programs",
      "jhs_special_programs",
    ],
    esf7_personnel_profile: [
      "allow_email_discrepancy",
      "status",
      "no_deped_email",
      "is_main_sh",
    ],
    esf7_regular_sections: ["extras"],
  };
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    for (const colName of cols) {
      const colCheck = await c.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
        [table, colName],
      );
      if (colCheck.rowCount === 0) {
        console.error(
          `❌ FATAL: Required column "${colName}" missing on table "${table}"`,
        );
        process.exit(1);
      }
    }
  }
  console.log("✓ All required tables and columns verified present.");

  // 2. Generic row generator driven by information_schema (only NOT NULL columns without a default are filled, plus known keys).
  async function columns(table) {
    return (
      await c.query(
        `SELECT column_name, data_type, character_maximum_length AS len, is_nullable, column_default, is_generated, is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [table],
      )
    ).rows;
  }
  const nProfiles = T.tables.esf7_personnel_profile || 0;
  const nSections = T.tables.esf7_regular_sections || 0;
  function valueExpr(table, tenant, cinfo, nP, nS) {
    const n = cinfo.column_name;
    const g = "g";
    const t = `'${tenant}'`;
    if (n === col) return t;
    if (n === "school_year") return `'${SY}'`;
    if (n === "id")
      return table === "esf7_personnel_profile"
        ? `'p${tenant}_'||${g}`
        : table === "esf7_regular_sections"
          ? `'s${tenant}_'||${g}`
          : `'w${tenant}_'||${g}`;
    if (n === "personnel_id" || n === "adviser_id")
      return `'p${tenant}_'||(1 + (${g} % ${Math.max(1, nP)}))`;
    if (n === "section_id")
      return `'s${tenant}_'||(1 + (${g} % ${Math.max(1, nS)}))`;
    if (n === "prn") return `'PRN${tenant}'||${g}`;
    if (n === "first_name") return `'Fake'||${g}`;
    if (n === "last_name") return `'Person'||${g}`;
    if (n === "grade_level") return `'Grade '||(7 + ${g} % 6)`;
    if (n === "section_name") return `'SECTION '||${g}`;
    if (n === "subject") return `'Subject '||(${g} % 12)`;
    if (n === "type") return `'teaching'`;
    if (n === "start_time") return `'07:30'::time`;
    if (n === "end_time") return `'08:20'::time`;
    switch (cinfo.data_type) {
      case "integer":
      case "smallint":
      case "bigint":
        return "1";
      case "numeric":
      case "real":
      case "double precision":
        return "1";
      case "boolean":
        return "false";
      case "date":
        return "current_date";
      case "timestamp with time zone":
      case "timestamp without time zone":
        return "now()";
      case "time without time zone":
        return `'08:00'::time`;
      case "jsonb":
      case "json":
        return `'{}'::jsonb`;
      default:
        return cinfo.len ? `left('x'||${g}, ${cinfo.len})` : `'x'||${g}`;
    }
  }
  async function seedTable(table, tenant, target, nP, nS) {
    const have = Number(
      (
        await c.query(
          `SELECT count(*)::bigint n FROM ${qi(table)} WHERE ${qi(col)} = $1`,
          [tenant],
        )
      ).rows[0].n,
    );
    if (have >= target) return 0;
    const cols = await columns(table);
    if (!cols.length) throw new Error("table " + table + " not found");
    let names, vals;
    if (table === "school_drafts") {
      names = ["school_id", "school_year", "payload"];
      vals = [
        `'${tenant}'`,
        `'${SY}'`,
        `(SELECT jsonb_build_object('schoolInfo', jsonb_build_object('schoolId', '${tenant}', 'schoolName', 'Fake School ${tenant}'),
        'personnel', (SELECT jsonb_agg(jsonb_build_object('id', 'p${tenant}_'||k, 'firstName', 'Fake'||k, 'lastName', 'Person'||k, 'type', 'teaching', 'workloadRows', (SELECT jsonb_agg(jsonb_build_object('subject', 'Subject '||(r % 12), 'gradeLevel', 'Grade '||(7 + r % 6), 'sectionName', 'SECTION '||r)) FROM generate_series(1, 8) r))) FROM generate_series(1, ${nP}) k),
        'classSections', (SELECT jsonb_agg(jsonb_build_object('id', 's${tenant}_'||k, 'gradeLevel', 'Grade '||(7 + k % 6), 'sectionName', 'SECTION '||k)) FROM generate_series(1, ${nS}) k)))`,
      ];
      await c.query(
        `INSERT INTO school_drafts (${names.join(",")}) SELECT ${vals.join(",")} FROM generate_series(1,1) g ON CONFLICT DO NOTHING`,
      );
      return 1;
    }
    const use = cols.filter(
      (ci) =>
        ci.is_generated !== "ALWAYS" &&
        ci.is_identity !== "YES" &&
        ((ci.is_nullable === "NO" && !ci.column_default) ||
          [
            "id",
            col,
            "school_year",
            "personnel_id",
            "section_id",
            "prn",
            "first_name",
            "last_name",
            "grade_level",
            "section_name",
            "subject",
            "start_time",
            "end_time",
            "adviser_id",
          ].includes(ci.column_name)),
    );
    names = use.map((ci) => qi(ci.column_name));
    vals = use.map((ci) => valueExpr(table, tenant, ci, nP, nS));
    const sql = `INSERT INTO ${qi(table)} (${names.join(",")}) SELECT ${vals.join(",")} FROM generate_series($1::int, $2::int) g ON CONFLICT DO NOTHING`;
    await c.query(sql, [have + 1, target]);
    return target - have;
  }
  const order = [
    "esf7_personnel_profile",
    "esf7_regular_sections",
    "esf7_workload_rows",
    "school_drafts",
  ];
  const tables = [
    ...order.filter((t) => T.tables[t] !== undefined),
    ...Object.keys(T.tables).filter((t) => !order.includes(t)),
  ];

  const big = String(T.school_id);
  console.log(`Seeding largest tenant ${big} ...`);
  for (const t of tables) {
    const n = await seedTable(t, big, T.tables[t], nProfiles, nSections);
    console.log(`  ${t}: +${n}`);
  }
  const accounts = [{ school_id: big, is_largest: true }];
  for (let i = 1; i <= (others.count || 0); i++) {
    const tid = String(610000 + i);
    const rp = others.rows_per_table || {};
    const nP = rp.esf7_personnel_profile || 10,
      nS = rp.esf7_regular_sections || 5;
    for (const t of tables) await seedTable(t, tid, rp[t] || 0, nP, nS);
    accounts.push({ school_id: tid, is_largest: false });
  }
  console.log(`Seeded ${others.count || 0} other tenants.`);
  await c.query("ANALYZE");

  // 3. Synthetic account tokens (signed with the load environment's own secret)
  for (const a of accounts) {
    const n = a.is_largest
      ? nProfiles
      : (others.rows_per_table || {}).esf7_personnel_profile || 10;
    a.personnel_ids = Array.from(
      { length: Math.min(40, n) },
      (_, i) => `p${a.school_id}_${1 + Math.floor((i * n) / Math.min(40, n))}`,
    );
    a.token = jwt.sign(
      { uid: `load-${a.school_id}`, role: "school", school_id: a.school_id },
      env.LOAD_JWT_SECRET,
      { algorithm: "HS256", expiresIn: "24h" },
    );
  }
  const accFile = path.resolve(
    root,
    env.LOAD_TEST_ACCOUNTS_FILE || "load-test/accounts.json",
  );
  fs.mkdirSync(path.dirname(accFile), { recursive: true });
  fs.writeFileSync(
    accFile,
    JSON.stringify(
      { generated_at: new Date().toISOString(), accounts },
      null,
      2,
    ),
  );
  console.log(
    `Wrote ${accounts.length} synthetic account tokens to ${path.relative(root, accFile)} (gitignored).`,
  );
  await c.end();
})().catch((e) => {
  console.error(
    "seed-large failed: " +
      String(e.message).replace(/postgres(ql)?:\/\/\S+/gi, "<url>"),
  );
  process.exit(1);
});
