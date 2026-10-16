require("../db/directPort");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const path = require("path");
const { Pool } = require("pg");

const dbUser = process.env.DB_USER || "Administrator1";
const dbPass = process.env.DB_PASSWORD || process.env.AZURE_PG_PASSWORD || "";
const dbHost =
  process.env.DB_HOST || "stride-posgre-prod-01.postgres.database.azure.com";
const dbPort = process.env.DB_DIRECT_PORT || 5432;

const PROD_URL =
  process.env.PROD_DATABASE_URL ||
  `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/insighted_esf7?sslmode=require`;
const STAGING_URL =
  process.env.STAGING_DATABASE_URL ||
  `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/insighted_esf7_staging?sslmode=require`;

const SCHOOL_IDS = ["300488", "342285", "105876", "108659", "104947"];
const ALL_VARIANTS = SCHOOL_IDS.flatMap((id) => [id, `SCH-${id}`]);

// Tables to truncate in staging (Preserving esf7_database, esf7_database_dummy, salary_matrix)
const TABLES_TO_TRUNCATE = [
  "clustered_personnel",
  "esf7_admin_task",
  "esf7_als_sections",
  "esf7_aral_sections",
  "esf7_correction_items",
  "esf7_hrmo_corrections",
  "esf7_passcode_lockout",
  "esf7_personnel_allowances",
  "esf7_personnel_designations",
  "esf7_personnel_employment",
  "esf7_personnel_extra_tasks",
  "esf7_personnel_id_mapping",
  "esf7_personnel_ld_trainings",
  "esf7_personnel_learning_areas",
  "esf7_personnel_node_status",
  "esf7_personnel_profile",
  "esf7_personnel_submission",
  "esf7_personnel_submission_archive",
  "esf7_perssonel_educ",
  "esf7_po3_corrections",
  "esf7_profiling_snapshots",
  "esf7_regular_sections",
  "esf7_related_task",
  "esf7_remedial_enrichment_sections",
  "esf7_requests",
  "esf7_room_roster_cache",
  "esf7_room_submissions_staging",
  "esf7_school_head_sdo",
  "esf7_school_node_status",
  "esf7_school_profile",
  "esf7_school_subjects",
  "esf7_shs_workload_rows",
  "esf7_sned_sections",
  "esf7_submission_queue",
  "esf7_term_status",
  "esf7_validation",
  "esf7_work_immersion",
  "esf7_workload_rows",
  "esf7_workload_transfer",
  "overload_absences",
  "overload_late_undertime",
  "overload_no_work",
  "overload_pay_and_reason",
  "schools_iern",
];

async function copyData() {
  const prodPool = new Pool({ connectionString: PROD_URL });
  const stagingPool = new Pool({ connectionString: STAGING_URL });

  const prodClient = await prodPool.connect();
  const stagingClient = await stagingPool.connect();

  try {
    // 1. Safety check
    const prodDbRes = await prodClient.query("SELECT current_database()");
    const stagingDbRes = await stagingClient.query("SELECT current_database()");

    console.log(`🔒 PROD (Read-Only): ${prodDbRes.rows[0].current_database}`);
    console.log(
      `🔒 STAGING (Target): ${stagingDbRes.rows[0].current_database}`,
    );

    if (prodDbRes.rows[0].current_database !== "insighted_esf7") {
      throw new Error("ABORT: PROD connection is not insighted_esf7!");
    }
    if (stagingDbRes.rows[0].current_database !== "insighted_esf7_staging") {
      throw new Error(
        "ABORT: STAGING connection is not insighted_esf7_staging!",
      );
    }

    console.log("\n========================================================");
    console.log("STEP 1: Truncating transactional tables in STAGING...");
    console.log("========================================================");

    await stagingClient.query("BEGIN;");
    await stagingClient.query(
      "ALTER TABLE esf7_personnel_profile ALTER COLUMN disabled_service_years SET DEFAULT 0;",
    );
    for (const tbl of TABLES_TO_TRUNCATE) {
      process.stdout.write(`Truncating ${tbl}... `);
      await stagingClient.query(
        `TRUNCATE TABLE "${tbl}" RESTART IDENTITY CASCADE;`,
      );
      console.log("✓ Done");
    }

    console.log("\n========================================================");
    console.log("STEP 2: Copying 5 schools data from PROD to STAGING...");
    console.log("Schools:", SCHOOL_IDS.join(", "));
    console.log("========================================================");

    // Helper function to copy rows matching school_id
    async function copySchoolTable(tableName, schoolIdColumn = "school_id") {
      process.stdout.write(`Copying ${tableName}... `);

      // Get staging column data types
      const colsRes = await stagingClient.query(
        `
        SELECT column_name, data_type, udt_name, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
      `,
        [tableName],
      );
      const stagingColMap = new Map(
        colsRes.rows.map((r) => [r.column_name, r]),
      );

      const prodColsRes = await prodClient.query(
        `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
      `,
        [tableName],
      );
      const commonCols = prodColsRes.rows
        .map((r) => r.column_name)
        .filter((c) => stagingColMap.has(c));

      if (commonCols.length === 0) {
        console.log(`[Skip - no common columns]`);
        return;
      }

      function formatVal(c, val) {
        const targetMeta = stagingColMap.get(c);
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
          if (
            val === "false" ||
            val === "f" ||
            val === 0 ||
            val === "0" ||
            val === false
          )
            return false;
          if (
            val === "true" ||
            val === "t" ||
            val === 1 ||
            val === "1" ||
            val === true
          )
            return true;
          if (targetMeta.is_nullable === "NO") return false;
          return null;
        }

        // 2. Integer / Numeric handling
        if (
          dt === "integer" ||
          dt === "smallint" ||
          dt === "bigint" ||
          dt === "numeric"
        ) {
          if (
            val === false ||
            val === "false" ||
            val === "N/A" ||
            val === "NONE" ||
            val === ""
          ) {
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
          if (
            !s ||
            s === "N/A" ||
            s === "NONE" ||
            s === "NULL" ||
            s === "-" ||
            s === "--"
          )
            return null;
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
            if (
              (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
              (trimmed.startsWith("[") && trimmed.endsWith("]"))
            ) {
              try {
                JSON.parse(trimmed);
                return trimmed;
              } catch (e) {
                if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                  const items = trimmed
                    .slice(1, -1)
                    .split(",")
                    .map((s) => s.replace(/^"|"$/g, "").trim())
                    .filter(Boolean);
                  return JSON.stringify(items);
                }
              }
            }
            return JSON.stringify(val);
          }
        }
        return val;
      }

      const insertCols = [...commonCols];
      const extraDefaults = [];
      for (const [colName, meta] of stagingColMap.entries()) {
        if (!insertCols.includes(colName)) {
          if (meta.is_nullable === "NO" && !meta.column_default) {
            insertCols.push(colName);
            let defaultVal = null;
            if (meta.data_type === "boolean") defaultVal = false;
            else if (meta.data_type === "json" || meta.data_type === "jsonb")
              defaultVal = "{}";
            else if (
              meta.data_type.includes("int") ||
              meta.data_type === "numeric"
            )
              defaultVal = 0;
            else defaultVal = "";
            extraDefaults.push({ col: colName, val: defaultVal });
          }
        }
      }

      const colList = insertCols.map((c) => `"${c}"`).join(", ");
      const selectList = commonCols.map((c) => `"${c}"`).join(", ");
      const rowsRes = await prodClient.query(
        `SELECT ${selectList} FROM "${tableName}" WHERE "${schoolIdColumn}" = ANY($1)`,
        [ALL_VARIANTS],
      );

      if (rowsRes.rows.length === 0) {
        console.log(`✓ 0 rows`);
        return;
      }

      // Batch insert into staging
      let inserted = 0;
      for (const row of rowsRes.rows) {
        const values = [
          ...commonCols.map((c) => formatVal(c, row[c])),
          ...extraDefaults.map((e) => e.val),
        ];
        const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
        await stagingClient.query(
          `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
        inserted++;
      }
      console.log(`✓ ${inserted} rows copied`);
    }

    // A. School Profile
    await copySchoolTable("esf7_school_profile", "school_id");

    // B. Personnel Profile
    await copySchoolTable("esf7_personnel_profile", "school_id");

    // Get all copied personnel IDs in staging
    const persRes = await stagingClient.query(
      "SELECT id FROM esf7_personnel_profile",
    );
    const persIds = persRes.rows.map((r) => r.id);
    console.log(
      `Copied ${persIds.length} personnel profiles across the 5 schools.`,
    );

    // Helper function to copy child tables matching personnel_id
    async function copyPersonnelChildTable(tableName) {
      if (persIds.length === 0) return;
      process.stdout.write(`Copying ${tableName}... `);

      const colsRes = await stagingClient.query(
        `
        SELECT column_name, data_type, udt_name, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
      `,
        [tableName],
      );
      const stagingColMap = new Map(
        colsRes.rows.map((r) => [r.column_name, r]),
      );

      const prodColsRes = await prodClient.query(
        `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
      `,
        [tableName],
      );
      const commonCols = prodColsRes.rows
        .map((r) => r.column_name)
        .filter((c) => stagingColMap.has(c));

      function formatVal(c, val) {
        const targetMeta = stagingColMap.get(c);
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
          if (
            val === "false" ||
            val === "f" ||
            val === 0 ||
            val === "0" ||
            val === false
          )
            return false;
          if (
            val === "true" ||
            val === "t" ||
            val === 1 ||
            val === "1" ||
            val === true
          )
            return true;
          if (targetMeta.is_nullable === "NO") return false;
          return null;
        }

        // 2. Integer / Numeric handling
        if (
          dt === "integer" ||
          dt === "smallint" ||
          dt === "bigint" ||
          dt === "numeric"
        ) {
          if (
            val === false ||
            val === "false" ||
            val === "N/A" ||
            val === "NONE" ||
            val === ""
          ) {
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
          if (
            !s ||
            s === "N/A" ||
            s === "NONE" ||
            s === "NULL" ||
            s === "-" ||
            s === "--"
          )
            return null;
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
            if (
              (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
              (trimmed.startsWith("[") && trimmed.endsWith("]"))
            ) {
              try {
                JSON.parse(trimmed);
                return trimmed;
              } catch (e) {
                if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                  const items = trimmed
                    .slice(1, -1)
                    .split(",")
                    .map((s) => s.replace(/^"|"$/g, "").trim())
                    .filter(Boolean);
                  return JSON.stringify(items);
                }
              }
            }
            return JSON.stringify(val);
          }
        }
        return val;
      }

      const insertCols = [...commonCols];
      const extraDefaults = [];
      for (const [colName, meta] of stagingColMap.entries()) {
        if (!insertCols.includes(colName)) {
          if (meta.is_nullable === "NO" && !meta.column_default) {
            insertCols.push(colName);
            let defaultVal = null;
            if (meta.data_type === "boolean") defaultVal = false;
            else if (meta.data_type === "json" || meta.data_type === "jsonb")
              defaultVal = "{}";
            else if (
              meta.data_type.includes("int") ||
              meta.data_type === "numeric"
            )
              defaultVal = 0;
            else defaultVal = "";
            extraDefaults.push({ col: colName, val: defaultVal });
          }
        }
      }

      const colList = insertCols.map((c) => `"${c}"`).join(", ");
      const selectList = commonCols.map((c) => `"${c}"`).join(", ");
      const rowsRes = await prodClient.query(
        `SELECT ${selectList} FROM "${tableName}" WHERE personnel_id = ANY($1)`,
        [persIds],
      );

      let count = 0;
      for (const row of rowsRes.rows) {
        const values = [
          ...commonCols.map((c) => formatVal(c, row[c])),
          ...extraDefaults.map((e) => e.val),
        ];
        const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
        await stagingClient.query(
          `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
        count++;
      }
      console.log(`✓ ${count} rows copied`);
    }

    // C. Personnel Child Tables
    await copyPersonnelChildTable("esf7_personnel_employment");
    await copyPersonnelChildTable("esf7_perssonel_educ");
    await copyPersonnelChildTable("esf7_personnel_learning_areas");
    await copyPersonnelChildTable("esf7_personnel_ld_trainings");
    await copyPersonnelChildTable("esf7_personnel_designations");

    // D. Class Sections
    await copySchoolTable("esf7_regular_sections", "school_id");
    await copySchoolTable("esf7_als_sections", "school_id");
    await copySchoolTable("esf7_sned_sections", "school_id");
    await copySchoolTable("esf7_aral_sections", "school_id");
    await copySchoolTable("esf7_remedial_enrichment_sections", "school_id");

    // E. Workload Rows & Transfers
    await copySchoolTable("esf7_workload_rows", "school_id");
    await copySchoolTable("esf7_shs_workload_rows", "school_id");
    await copySchoolTable("esf7_admin_task", "school_id");

    // F. Requests
    process.stdout.write(`Copying esf7_requests... `);
    const reqColsRes = await stagingClient.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'esf7_requests' AND table_schema = 'public'
    `);
    const reqStagingCols = new Set(reqColsRes.rows.map((r) => r.column_name));
    const reqProdColsRes = await prodClient.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'esf7_requests' AND table_schema = 'public'
    `);
    const reqCommonCols = reqProdColsRes.rows
      .map((r) => r.column_name)
      .filter((c) => reqStagingCols.has(c));
    const reqColList = reqCommonCols.map((c) => `"${c}"`).join(", ");

    const reqRows = await prodClient.query(
      `SELECT ${reqColList} FROM esf7_requests WHERE requester_school_id = ANY($1) OR target_school_id = ANY($1)`,
      [ALL_VARIANTS],
    );
    let reqCount = 0;
    for (const row of reqRows.rows) {
      const values = reqCommonCols.map((c) => row[c]);
      const placeholders = reqCommonCols.map((_, i) => `$${i + 1}`).join(", ");
      await stagingClient.query(
        `INSERT INTO esf7_requests (${reqColList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        values,
      );
      reqCount++;
    }
    console.log(`✓ ${reqCount} rows copied`);

    await stagingClient.query("COMMIT;");
    console.log("\n🎉 ALL 5 SCHOOLS DATA SUCCESSFULLY COPIED TO STAGING!");

    // Verification summary per school
    console.log("\n========================================================");
    console.log("FINAL STAGING VERIFICATION PER SCHOOL");
    console.log("========================================================");
    for (const sid of SCHOOL_IDS) {
      const pRes = await stagingClient.query(
        "SELECT COUNT(*) FROM esf7_personnel_profile WHERE school_id IN ($1, $2)",
        [sid, `SCH-${sid}`],
      );
      const sRes = await stagingClient.query(
        "SELECT COUNT(*) FROM esf7_regular_sections WHERE school_id IN ($1, $2)",
        [sid, `SCH-${sid}`],
      );
      const wRes = await stagingClient.query(
        "SELECT COUNT(*) FROM esf7_workload_rows WHERE school_id IN ($1, $2)",
        [sid, `SCH-${sid}`],
      );
      console.log(
        `School ${sid}: ${pRes.rows[0].count} personnel, ${sRes.rows[0].count} sections, ${wRes.rows[0].count} workloads`,
      );
    }
  } catch (err) {
    await stagingClient.query("ROLLBACK;");
    console.error("❌ Copy failed:", err);
  } finally {
    prodClient.release();
    stagingClient.release();
    await prodPool.end();
    await stagingPool.end();
  }
}

copyData().catch(console.error);
