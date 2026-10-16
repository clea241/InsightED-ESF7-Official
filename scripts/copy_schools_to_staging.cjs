const { Client } = require("pg");

const RAW_SCHOOL_IDS = [
  "300478",
  "107891",
  "305335",
  "305419",
  "500564",
  "300605",
  "306356",
  "305420"
];

// Include SCH- prefixes if any exist
const ALL_SCHOOL_VARIANTS = RAW_SCHOOL_IDS.flatMap(id => [id, `SCH-${id}`]);

const EXCLUDED_TABLES = [
  "school_drafts",
  "school_draft",
  "room_cache",
  "esf7_room_roster_cache",
  "deleted_personnel",
  "esf7_deleted_personnel",
  "esf7_database",
  "esf7_database_2.0",
  "esf7_database_dummy",
  "salary_matrix"
];

const DB_CONFIG = {
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  ssl: { rejectUnauthorized: false }
};

const TABLE_TRANSFER_ORDER = [
  // 1. Lookups & Root School
  "esf7_correction_items",
  "esf7_school_profile",
  "schools_iern",
  "esf7_school_node_status",
  "esf7_passcode_lockout",
  "esf7_term_status",

  // 2. Personnel Profiles
  "esf7_personnel_profile",

  // 3. Sections & Classes
  "esf7_regular_sections",
  "esf7_aral_sections",
  "esf7_als_sections",
  "esf7_sned_sections",
  "esf7_remedial_enrichment_sections",
  "esf7_school_subjects",

  // 4. Personnel Child Tables
  "esf7_personnel_employment",
  "esf7_perssonel_educ",
  "esf7_personnel_ld_trainings",
  "esf7_personnel_learning_areas",
  "esf7_personnel_allowances",
  "esf7_personnel_designations",
  "esf7_personnel_extra_tasks",
  "esf7_personnel_node_status",
  "esf7_personnel_submission_archive",
  "esf7_clustered_ghost_sync",
  "clustered_personnel",

  // 5. Workloads & Tasks
  "esf7_workload_rows",
  "esf7_shs_workload_rows",
  "esf7_admin_task",
  "esf7_related_task",
  "esf7_work_immersion",
  "esf7_workload_transfer",
  "overload_absences",
  "overload_late_undertime",
  "overload_no_work",
  "overload_pay_and_reason",
  "esf7_validation",
  "esf7_requests",
  "esf7_hrmo_corrections",
  "esf7_po3_corrections",
  "esf7_link"
];

function formatVal(c, val, targetMeta) {
  if (!targetMeta) return val;
  const dt = targetMeta.data_type.toLowerCase();

  if (val === null || val === undefined) {
    if (c === "disabled_service_years") return 0;
    if (targetMeta.is_nullable === "NO") {
      if (dt === "boolean") return false;
      if (dt === "json" || dt === "jsonb") return "{}";
      if (dt.includes("int") || dt === "numeric") return 0;
      return "";
    }
    return null;
  }

  // 1. Boolean handling
  if (dt === "boolean") {
    if (val === "false" || val === "f" || val === 0 || val === "0" || val === false) return false;
    if (val === "true" || val === "t" || val === 1 || val === "1" || val === true) return true;
    if (targetMeta.is_nullable === "NO") return false;
    return null;
  }

  // 2. Integer / Numeric handling
  if (dt === "integer" || dt === "smallint" || dt === "bigint" || dt === "numeric") {
    if (val === false || val === "false" || val === "N/A" || val === "NONE" || val === "") {
      return targetMeta.is_nullable === "NO" ? 0 : null;
    }
    if (val === true || val === "true") return 1;
    const num = Number(val);
    if (isNaN(num)) return targetMeta.is_nullable === "NO" ? 0 : null;
    return Math.round(num);
  }

  // 3. Date handling
  if (dt === "date") {
    if (!val) return null;
    const s = String(val).trim();
    if (!s || s === "N/A" || s === "NONE" || s === "NULL" || s === "-" || s === "--") return null;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    const yr = d.getFullYear();
    if (yr < 1920 || yr > 2050) return null;
    return d.toISOString().slice(0, 10);
  }

  // 4. JSON / JSONB handling
  if (dt === "json" || dt === "jsonb") {
    if (typeof val === "object") return JSON.stringify(val);
    if (typeof val === "string") {
      const trimmed = val.trim();
      if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        try {
          JSON.parse(trimmed);
          return trimmed;
        } catch (e) {
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            const items = trimmed.slice(1, -1).split(",").map(s => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
            return JSON.stringify(items);
          }
        }
      }
      return JSON.stringify(val);
    }
  }
  return val;
}

async function executeMigration() {
  console.log("==================================================================");
  console.log("       STARTING FULL SCHOOL DATA REPLICATION TO STAGING           ");
  console.log("  Target Schools: " + RAW_SCHOOL_IDS.join(", "));
  console.log("==================================================================\n");

  const source = new Client({ ...DB_CONFIG, database: "insighted_esf7" });
  const target = new Client({ ...DB_CONFIG, database: "insighted_esf7_staging" });

  await source.connect();
  console.log("✓ Connected to SOURCE: insighted_esf7");
  await target.connect();
  console.log("✓ Connected to TARGET: insighted_esf7_staging");

  try {
    // 1. Ensure target has missing columns
    console.log("\n▶ Harmonizing schema columns in staging...");
    await target.query(`
      ALTER TABLE esf7_school_profile 
      ADD COLUMN IF NOT EXISTS shift_start_time character varying(50),
      ADD COLUMN IF NOT EXISTS shift_end_time character varying(50);
    `);
    console.log("✓ esf7_school_profile columns up to date.");

    // 2. Identify personnel IDs in source and target
    const pSourceRes = await source.query(
      `SELECT id::text FROM esf7_personnel_profile WHERE school_id = ANY($1::text[])`,
      [ALL_SCHOOL_VARIANTS]
    );
    const sourcePersonnelIds = pSourceRes.rows.map(r => r.id);
    console.log(`\nFound ${sourcePersonnelIds.length} personnel profiles in SOURCE for target schools.`);

    let targetPersonnelIds = [];
    try {
      const pTargetRes = await target.query(
        `SELECT id::text FROM esf7_personnel_profile WHERE school_id = ANY($1::text[])`,
        [ALL_SCHOOL_VARIANTS]
      );
      targetPersonnelIds = pTargetRes.rows.map(r => r.id);
      console.log(`Found ${targetPersonnelIds.length} existing personnel profiles in TARGET.`);
    } catch (e) {
      console.warn("Notice checking target personnel:", e.message);
    }
    const cleanPersonnelIds = Array.from(new Set([...sourcePersonnelIds, ...targetPersonnelIds]));

    // 3. Inspect target tables set
    const tTablesRes = await target.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const targetTablesSet = new Set(tTablesRes.rows.map(r => r.table_name));

    // 4. Set replication role to replica to avoid constraint errors during sync
    console.log("\n▶ Setting target session_replication_role = 'replica'...");
    await target.query("SET session_replication_role = 'replica';");

    // 5. Cleanup existing data for target schools in TARGET
    console.log("\n▶ Cleaning up stale data in TARGET for these 8 schools...");
    const cleanupOrder = [...TABLE_TRANSFER_ORDER].reverse();

    for (const table of cleanupOrder) {
      if (table === "esf7_correction_items") continue; // Global lookup, don't delete
      if (!targetTablesSet.has(table)) continue;

      const colRes = await target.query(`
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table]);
      const cols = colRes.rows.map(c => c.column_name);

      try {
        if (cols.includes("school_id")) {
          const delRes = await target.query(
            `DELETE FROM "${table}" WHERE school_id = ANY($1::text[])`,
            [ALL_SCHOOL_VARIANTS]
          );
          if (delRes.rowCount > 0) {
            console.log(`  - Deleted ${delRes.rowCount} rows from "${table}" (by school_id)`);
          }
        } else if (cols.includes("personnel_id") && cleanPersonnelIds.length > 0) {
          const delRes = await target.query(
            `DELETE FROM "${table}" WHERE personnel_id::text = ANY($1::text[])`,
            [cleanPersonnelIds]
          );
          if (delRes.rowCount > 0) {
            console.log(`  - Deleted ${delRes.rowCount} rows from "${table}" (by personnel_id)`);
          }
        } else if (table === "clustered_personnel" && cols.includes("source_school_id")) {
          const delRes = await target.query(
            `DELETE FROM "${table}" WHERE source_school_id = ANY($1::text[]) OR target_school_id = ANY($1::text[])`,
            [ALL_SCHOOL_VARIANTS]
          );
          if (delRes.rowCount > 0) {
            console.log(`  - Deleted ${delRes.rowCount} rows from "${table}" (by school_id)`);
          }
        }
      } catch (err) {
        console.warn(`  ! Cleanup notice on ${table}:`, err.message);
      }
    }

    // 6. Copy Data from SOURCE to TARGET
    console.log("\n▶ Copying records from SOURCE to TARGET...");
    const results = [];

    for (const table of TABLE_TRANSFER_ORDER) {
      if (EXCLUDED_TABLES.includes(table)) continue;
      if (!targetTablesSet.has(table)) {
        console.log(`  Skipping ${table} (not in target)`);
        continue;
      }

      const sColsRes = await source.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      if (sColsRes.rows.length === 0) continue;

      const tColsRes = await target.query(`
        SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table]);
      const tColsMap = new Map(tColsRes.rows.map(c => [c.column_name, c]));

      const sCols = sColsRes.rows.map(c => c.column_name);
      const commonCols = sCols.filter(c => tColsMap.has(c));

      let selectSql = "";
      let selectParams = [];
      let verifyTargetSql = "";
      let verifyTargetParams = [];

      if (table === "esf7_correction_items") {
        selectSql = `SELECT ${commonCols.map(c => `"${c}"`).join(", ")} FROM "${table}"`;
        selectParams = [];
        verifyTargetSql = `SELECT count(*)::int as cnt FROM "${table}"`;
        verifyTargetParams = [];
      } else if (sCols.includes("school_id")) {
        selectSql = `SELECT ${commonCols.map(c => `"${c}"`).join(", ")} FROM "${table}" WHERE school_id = ANY($1::text[])`;
        selectParams = [ALL_SCHOOL_VARIANTS];
        verifyTargetSql = `SELECT count(*)::int as cnt FROM "${table}" WHERE school_id = ANY($1::text[])`;
        verifyTargetParams = [ALL_SCHOOL_VARIANTS];
      } else if (sCols.includes("personnel_id") && sourcePersonnelIds.length > 0) {
        selectSql = `SELECT ${commonCols.map(c => `"${c}"`).join(", ")} FROM "${table}" WHERE personnel_id::text = ANY($1::text[])`;
        selectParams = [sourcePersonnelIds];
        verifyTargetSql = `SELECT count(*)::int as cnt FROM "${table}" WHERE personnel_id::text = ANY($1::text[])`;
        verifyTargetParams = [sourcePersonnelIds];
      } else if (table === "clustered_personnel" && sCols.includes("source_school_id")) {
        selectSql = `SELECT ${commonCols.map(c => `"${c}"`).join(", ")} FROM "${table}" WHERE source_school_id = ANY($1::text[]) OR target_school_id = ANY($1::text[])`;
        selectParams = [ALL_SCHOOL_VARIANTS];
        verifyTargetSql = `SELECT count(*)::int as cnt FROM "${table}" WHERE source_school_id = ANY($1::text[]) OR target_school_id = ANY($1::text[])`;
        verifyTargetParams = [ALL_SCHOOL_VARIANTS];
      } else {
        continue;
      }

      const rowsRes = await source.query(selectSql, selectParams);
      const sourceRows = rowsRes.rows;
      const countSource = sourceRows.length;

      if (countSource === 0) {
        results.push({ table, sourceRows: 0, targetRows: 0, status: "EMPTY" });
        continue;
      }

      console.log(`  -> Inserting ${countSource} rows into "${table}"...`);
      const BATCH_SIZE = 100;
      const colList = commonCols.map(c => `"${c}"`).join(", ");

      for (let i = 0; i < sourceRows.length; i += BATCH_SIZE) {
        const batch = sourceRows.slice(i, i + BATCH_SIZE);
        const valueClauses = [];
        const flatValues = [];
        let pIndex = 1;

        for (const row of batch) {
          const rowParams = [];
          for (const col of commonCols) {
            rowParams.push(`$${pIndex++}`);
            const meta = tColsMap.get(col);
            flatValues.push(formatVal(col, row[col], meta));
          }
          valueClauses.push(`(${rowParams.join(", ")})`);
        }

        const insertSql = `
          INSERT INTO "${table}" (${colList})
          VALUES ${valueClauses.join(", ")}
          ON CONFLICT DO NOTHING;
        `;
        await target.query(insertSql, flatValues);
      }

      // Verification count
      const verifyRes = await target.query(verifyTargetSql, verifyTargetParams);
      const countTarget = verifyRes.rows[0].cnt;

      results.push({
        table,
        sourceRows: countSource,
        targetRows: countTarget,
        status: countSource === countTarget ? "MATCH" : `DIFF (${countSource} vs ${countTarget})`
      });
    }

    // 7. Restore replication role
    console.log("\n▶ Restoring session_replication_role = 'origin'...");
    await target.query("SET session_replication_role = 'origin';");

    // 8. Output Final Report
    console.log("\n================================================================================");
    console.log("                       FINAL VERIFICATION & AUDIT TABLE                         ");
    console.log("================================================================================");
    console.log(
      "Table Name".padEnd(38) +
      "Source (insighted_esf7)".padEnd(25) +
      "Target (staging)".padEnd(20) +
      "Status"
    );
    console.log("-".repeat(95));

    let allMatch = true;
    for (const r of results) {
      console.log(
        r.table.padEnd(38) +
        String(r.sourceRows).padEnd(25) +
        String(r.targetRows).padEnd(20) +
        r.status
      );
      if (r.status !== "MATCH" && r.status !== "EMPTY") {
        allMatch = false;
      }
    }
    console.log("-".repeat(95));

    // School level summary
    console.log("\n================================================================================");
    console.log("                     BREAKDOWN BY SCHOOL (STAGING VERIFICATION)                 ");
    console.log("================================================================================");
    for (const sid of RAW_SCHOOL_IDS) {
      const pRes = await target.query(
        "SELECT count(*)::int as c FROM esf7_personnel_profile WHERE school_id = ANY($1::text[])",
        [[sid, `SCH-${sid}`]]
      );
      const sRes = await target.query(
        "SELECT count(*)::int as c FROM esf7_regular_sections WHERE school_id = ANY($1::text[])",
        [[sid, `SCH-${sid}`]]
      );
      const wRes = await target.query(
        "SELECT count(*)::int as c FROM esf7_workload_rows WHERE school_id = ANY($1::text[])",
        [[sid, `SCH-${sid}`]]
      );
      console.log(`School ${sid.padEnd(10)}: ${String(pRes.rows[0].c).padStart(3)} personnel, ${String(sRes.rows[0].c).padStart(3)} sections, ${String(wRes.rows[0].c).padStart(4)} workloads`);
    }

    if (allMatch) {
      console.log("\n🎉 ALL 8 SCHOOLS SUCCESSFULLY COPIED WITH 100% PARITY!");
    } else {
      console.log("\n⚠️ Notice: Please verify any DIFF rows above.");
    }

  } finally {
    try {
      await target.query("SET session_replication_role = 'origin';");
    } catch (e) {}
    await source.end();
    await target.end();
  }
}

executeMigration().catch(err => {
  console.error("\n❌ FATAL ERROR:", err);
  process.exit(1);
});
