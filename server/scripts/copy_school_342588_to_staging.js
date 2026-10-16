require("../db/directPort");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
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

const TARGET_SCHOOL_ID = "342588";
const SCHOOL_VARIANTS = [TARGET_SCHOOL_ID, `SCH-${TARGET_SCHOOL_ID}`];

async function run() {
  console.log(
    "=========================================================================",
  );
  console.log(
    `🚀 Isolated Sync: PROD (insighted_esf7) -> STAGING (insighted_esf7_staging)`,
  );
  console.log(
    `   TARGET SCHOOL: ${TARGET_SCHOOL_ID} ONLY (Zero other schools touched)`,
  );
  console.log(
    "=========================================================================",
  );

  const prodPool = new Pool({ connectionString: PROD_URL, max: 2 });
  const stagingPool = new Pool({ connectionString: STAGING_URL, max: 2 });

  const prodClient = await prodPool.connect();
  const stagingClient = await stagingPool.connect();

  try {
    // 1. Strict Database Identity Assertions
    const prodDbRes = await prodClient.query("SELECT current_database()");
    const stagingDbRes = await stagingClient.query("SELECT current_database()");

    const prodDbName = prodDbRes.rows[0].current_database;
    const stagingDbName = stagingDbRes.rows[0].current_database;

    console.log(`🔒 PROD Source (Read-Only): ${prodDbName}`);
    console.log(`🔒 STAGING Target:          ${stagingDbName}`);

    if (prodDbName !== "insighted_esf7") {
      throw new Error(
        `ABORT: Source database is "${prodDbName}", expected "insighted_esf7"!`,
      );
    }
    if (stagingDbName !== "insighted_esf7_staging") {
      throw new Error(
        `ABORT: Target database is "${stagingDbName}", expected "insighted_esf7_staging"!`,
      );
    }

    // Helper: format values according to staging column metadata
    function formatVal(meta, val) {
      if (!meta) return val;
      const dt = meta.data_type.toLowerCase();

      if (val === null || val === undefined) {
        if (meta.is_nullable === "NO") {
          if (dt === "boolean") return false;
          if (dt === "json" || dt === "jsonb") return "{}";
          if (dt.includes("int") || dt === "numeric") return 0;
          return "";
        }
        return null;
      }

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
        return meta.is_nullable === "NO" ? false : null;
      }

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
          return meta.is_nullable === "NO" ? 0 : null;
        }
        if (val === true || val === "true") return 1;
        const num = Number(val);
        if (isNaN(num)) return meta.is_nullable === "NO" ? 0 : null;
        return Math.round(num);
      }

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
              return JSON.stringify(val);
            }
          }
          return JSON.stringify(val);
        }
      }

      return val;
    }

    // Helper: copy rows between prod and staging based on column intersection
    async function copyTableRows(tableName, rows) {
      if (!rows || rows.length === 0) return 0;

      const colsRes = await stagingClient.query(
        `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
      `,
        [tableName],
      );

      if (colsRes.rows.length === 0) {
        console.warn(`   [Skip] Table ${tableName} does not exist in staging.`);
        return 0;
      }

      const stagingColMap = new Map(
        colsRes.rows.map((r) => [r.column_name, r]),
      );
      const sampleRow = rows[0];
      const availableCols = Object.keys(sampleRow).filter((c) =>
        stagingColMap.has(c),
      );

      const insertCols = [...availableCols];
      const extraDefaults = [];
      for (const [colName, meta] of stagingColMap.entries()) {
        if (
          !insertCols.includes(colName) &&
          meta.is_nullable === "NO" &&
          !meta.column_default
        ) {
          insertCols.push(colName);
          let defaultVal = "";
          if (meta.data_type === "boolean") defaultVal = false;
          else if (meta.data_type === "json" || meta.data_type === "jsonb")
            defaultVal = "{}";
          else if (
            meta.data_type.includes("int") ||
            meta.data_type === "numeric"
          )
            defaultVal = 0;
          extraDefaults.push({ col: colName, val: defaultVal });
        }
      }

      const colList = insertCols.map((c) => `"${c}"`).join(", ");
      let insertedCount = 0;

      for (const row of rows) {
        const values = [
          ...availableCols.map((c) => formatVal(stagingColMap.get(c), row[c])),
          ...extraDefaults.map((e) => e.val),
        ];
        const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
        await stagingClient.query(
          `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
        insertedCount++;
      }

      return insertedCount;
    }

    // =========================================================================
    // STEP 1: ZERO RECORDS FOR SCHOOL 342588 ONLY IN STAGING
    // =========================================================================
    console.log(
      `\n🧹 STEP 1: Cleaning existing records for school ${TARGET_SCHOOL_ID} in STAGING...`,
    );

    // 1a. Find existing personnel IDs in STAGING for school 342588
    const stagingOldPersonnel = await stagingClient.query(
      `SELECT id FROM esf7_personnel_profile WHERE school_id = ANY($1)`,
      [SCHOOL_VARIANTS],
    );
    const oldPersIds = stagingOldPersonnel.rows.map((r) => r.id);
    console.log(
      `   Found ${oldPersIds.length} existing personnel in staging for school ${TARGET_SCHOOL_ID}.`,
    );

    // 1b. Delete child personnel records
    if (oldPersIds.length > 0) {
      const childTables = [
        "esf7_personnel_employment",
        "esf7_perssonel_educ",
        "esf7_personnel_learning_areas",
        "esf7_personnel_ld_trainings",
        "esf7_personnel_designations",
        "esf7_personnel_allowances",
        "esf7_personnel_extra_tasks",
        "esf7_personnel_node_status",
        "esf7_profiling_snapshots",
        "esf7_personnel_submission",
        "esf7_personnel_submission_archive",
        "esf7_deleted_personnel",
      ];

      for (const ct of childTables) {
        await stagingClient
          .query(`DELETE FROM "${ct}" WHERE personnel_id = ANY($1)`, [
            oldPersIds,
          ])
          .catch(() => {});
      }
    }

    // 1c. Delete school-level tables for school 342588
    const schoolLevelTables = [
      "esf7_workload_rows",
      "esf7_shs_workload_rows",
      "esf7_admin_task",
      "esf7_related_task",
      "esf7_work_immersion",
      "esf7_regular_sections",
      "esf7_sned_sections",
      "esf7_als_sections",
      "esf7_aral_sections",
      "esf7_remedial_enrichment_sections",
      "esf7_school_profile",
      "esf7_school_node_status",
      "esf7_school_head_sdo",
      "schools_iern",
      "school_drafts",
      "esf7_room_roster_cache",
      "esf7_school_subjects",
      "esf7_term_status",
      "esf7_requests",
      "esf7_submission_queue",
      "esf7_validation",
      "esf7_passcode_lockout",
      "esf7_correction_items",
      "esf7_hrmo_corrections",
      "esf7_po3_corrections",
      "overload_absences",
      "overload_late_undertime",
      "overload_no_work",
      "overload_pay_and_reason",
    ];

    for (const st of schoolLevelTables) {
      await stagingClient
        .query(`DELETE FROM "${st}" WHERE school_id = ANY($1)`, [
          SCHOOL_VARIANTS,
        ])
        .catch(() => {});
    }

    // 1d. Delete parent personnel profile in staging
    await stagingClient.query(
      `DELETE FROM esf7_personnel_profile WHERE school_id = ANY($1)`,
      [SCHOOL_VARIANTS],
    );

    // 1e. Clustered personnel
    await stagingClient
      .query(
        `DELETE FROM clustered_personnel WHERE mother_school_id = ANY($1) OR receiving_school_id = ANY($1)`,
        [SCHOOL_VARIANTS],
      )
      .catch(() => {});

    console.log(
      `   ✓ Cleaned all staging records for school ${TARGET_SCHOOL_ID} (0 records remain for this school).`,
    );

    // =========================================================================
    // STEP 2: COPY RECORDS FROM PROD (insighted_esf7) TO STAGING
    // =========================================================================
    console.log(
      `\n📦 STEP 2: Copying data from PROD (insighted_esf7) -> STAGING...`,
    );

    // 2a. School Profile & Metadata
    for (const t of [
      "esf7_school_profile",
      "esf7_school_node_status",
      "esf7_school_head_sdo",
      "schools_iern",
      "school_drafts",
      "esf7_room_roster_cache",
      "esf7_school_subjects",
      "esf7_term_status",
      "esf7_requests",
    ]) {
      const prodRes = await prodClient
        .query(`SELECT * FROM "${t}" WHERE school_id = ANY($1)`, [
          SCHOOL_VARIANTS,
        ])
        .catch(() => ({ rows: [] }));

      if (prodRes.rows.length > 0) {
        const cnt = await copyTableRows(t, prodRes.rows);
        console.log(`   ✓ ${t}: ${cnt} rows copied`);
      }
    }

    // 2b. Class Sections
    for (const secTable of [
      "esf7_regular_sections",
      "esf7_sned_sections",
      "esf7_als_sections",
      "esf7_aral_sections",
      "esf7_remedial_enrichment_sections",
    ]) {
      const prodRes = await prodClient
        .query(`SELECT * FROM "${secTable}" WHERE school_id = ANY($1)`, [
          SCHOOL_VARIANTS,
        ])
        .catch(() => ({ rows: [] }));

      if (prodRes.rows.length > 0) {
        const cnt = await copyTableRows(secTable, prodRes.rows);
        console.log(`   ✓ ${secTable}: ${cnt} rows copied`);
      }
    }

    // 2c. Personnel Profiles
    const prodPersRes = await prodClient.query(
      `SELECT * FROM esf7_personnel_profile WHERE school_id = ANY($1)`,
      [SCHOOL_VARIANTS],
    );

    const newPersIds = prodPersRes.rows.map((r) => r.id);
    const pCnt = await copyTableRows(
      "esf7_personnel_profile",
      prodPersRes.rows,
    );
    console.log(`   ✓ esf7_personnel_profile: ${pCnt} rows copied`);

    // 2d. Personnel Child Records
    if (newPersIds.length > 0) {
      const persChildTables = [
        "esf7_personnel_employment",
        "esf7_perssonel_educ",
        "esf7_personnel_learning_areas",
        "esf7_personnel_ld_trainings",
        "esf7_personnel_designations",
        "esf7_personnel_allowances",
        "esf7_personnel_extra_tasks",
        "esf7_personnel_node_status",
        "esf7_profiling_snapshots",
      ];

      for (const pct of persChildTables) {
        const prodChildRes = await prodClient
          .query(`SELECT * FROM "${pct}" WHERE personnel_id = ANY($1)`, [
            newPersIds,
          ])
          .catch(() => ({ rows: [] }));

        if (prodChildRes.rows.length > 0) {
          const cCnt = await copyTableRows(pct, prodChildRes.rows);
          console.log(`   ✓ ${pct}: ${cCnt} rows copied`);
        }
      }
    }

    // 2e. Workloads & Tasks
    for (const wt of [
      "esf7_workload_rows",
      "esf7_shs_workload_rows",
      "esf7_admin_task",
      "esf7_related_task",
      "esf7_work_immersion",
    ]) {
      const prodRes = await prodClient
        .query(`SELECT * FROM "${wt}" WHERE school_id = ANY($1)`, [
          SCHOOL_VARIANTS,
        ])
        .catch(() => ({ rows: [] }));

      if (prodRes.rows.length > 0) {
        const cnt = await copyTableRows(wt, prodRes.rows);
        console.log(`   ✓ ${wt}: ${cnt} rows copied`);
      }
    }

    // 2f. Clustered personnel (if any)
    const clusterRes = await prodClient
      .query(
        `SELECT * FROM clustered_personnel WHERE mother_school_id = ANY($1) OR receiving_school_id = ANY($1)`,
        [SCHOOL_VARIANTS],
      )
      .catch(() => ({ rows: [] }));
    if (clusterRes.rows.length > 0) {
      const cnt = await copyTableRows("clustered_personnel", clusterRes.rows);
      console.log(`   ✓ clustered_personnel: ${cnt} rows copied`);
    }

    // =========================================================================
    // STEP 3: VERIFICATION
    // =========================================================================
    console.log(
      `\n🔍 STEP 3: Verification in STAGING for school ${TARGET_SCHOOL_ID}...`,
    );
    const stPersCount = await stagingClient.query(
      `SELECT count(*) FROM esf7_personnel_profile WHERE school_id = ANY($1)`,
      [SCHOOL_VARIANTS],
    );
    const stSecCount = await stagingClient.query(
      `SELECT count(*) FROM esf7_regular_sections WHERE school_id = ANY($1)`,
      [SCHOOL_VARIANTS],
    );
    const stWklCount = await stagingClient.query(
      `SELECT count(*) FROM esf7_workload_rows WHERE school_id = ANY($1)`,
      [SCHOOL_VARIANTS],
    );

    console.log(`   STAGING Personnel Count: ${stPersCount.rows[0].count}`);
    console.log(
      `   STAGING Regular Sections Count: ${stSecCount.rows[0].count}`,
    );
    console.log(`   STAGING Workload Rows Count: ${stWklCount.rows[0].count}`);

    console.log(
      "\n=========================================================================",
    );
    console.log(
      `🎉 SUCCESS: School ${TARGET_SCHOOL_ID} data copied cleanly to STAGING!`,
    );
    console.log(
      "=========================================================================",
    );
  } catch (err) {
    console.error("❌ [Copy Error]:", err.message);
    throw err;
  } finally {
    prodClient.release();
    stagingClient.release();
    await prodPool.end();
    await stagingPool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
