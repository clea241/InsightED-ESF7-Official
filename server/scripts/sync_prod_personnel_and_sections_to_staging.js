const path = require("path");
const root = "e:\\InsightED - ESF7 Official";
const { Pool } = require(path.join(root, "node_modules", "pg"));

const PROD_URL =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require";
const STAGING_URL =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7_staging?sslmode=require";

const TARGET_SCHOOLS = ["300488", "342285"];

function sanitizeValue(val, colType) {
  if (val === null || val === undefined) return null;
  if (colType === "jsonb" || colType === "json") {
    if (typeof val === "object") {
      return JSON.stringify(val);
    }
    return val;
  }
  return val;
}

async function run() {
  console.log(
    "=========================================================================",
  );
  console.log("🚀 Syncing PROD Standardized Personnel & Sections -> STAGING");
  console.log("   Schools: 300488 & 342285 ONLY");
  console.log(
    "=========================================================================",
  );

  const prod = new Pool({ connectionString: PROD_URL, max: 2 });
  const staging = new Pool({ connectionString: STAGING_URL, max: 2 });

  try {
    const sPair = [
      TARGET_SCHOOLS[0],
      `SCH-${TARGET_SCHOOLS[0]}`,
      TARGET_SCHOOLS[1],
      `SCH-${TARGET_SCHOOLS[1]}`,
    ];

    // 1. Get existing personnel IDs in staging to cleanly delete children
    const stagingOldP = await staging.query(
      `SELECT id FROM esf7_personnel_profile WHERE school_id = ANY($1)`,
      [sPair],
    );
    const oldIds = stagingOldP.rows.map((r) => r.id);
    console.log(
      `🧹 Removing old unstandardized records for target schools in STAGING (${oldIds.length} personnel)...`,
    );

    if (oldIds.length > 0) {
      await staging.query(
        `DELETE FROM esf7_workload_rows WHERE school_id = ANY($1) OR personnel_id = ANY($2)`,
        [sPair, oldIds],
      );
      await staging.query(
        `DELETE FROM esf7_personnel_learning_areas WHERE personnel_id = ANY($1)`,
        [oldIds],
      );
      await staging.query(
        `DELETE FROM esf7_personnel_ld_trainings WHERE personnel_id = ANY($1)`,
        [oldIds],
      );
      await staging.query(
        `DELETE FROM esf7_perssonel_educ WHERE personnel_id = ANY($1)`,
        [oldIds],
      );
      await staging.query(
        `DELETE FROM esf7_personnel_employment WHERE personnel_id = ANY($1)`,
        [oldIds],
      );
      await staging.query(
        `DELETE FROM esf7_personnel_profile WHERE id = ANY($1) OR school_id = ANY($2)`,
        [oldIds, sPair],
      );
    }
    console.log("   ✓ Cleaned old staging personnel & child tables.");

    // 2. Fetch standardized personnel from PROD
    console.log("\n📦 Fetching standardized personnel from PROD...");
    const pColsRes = await prod.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'esf7_personnel_profile' ORDER BY ordinal_position
    `);
    const pCols = pColsRes.rows.map((r) => r.column_name);
    const pColTypes = Object.fromEntries(
      pColsRes.rows.map((r) => [r.column_name, r.data_type]),
    );

    const prodPersonnel = await prod.query(
      `
      SELECT ${pCols.map((c) => `"${c}"`).join(", ")} 
      FROM esf7_personnel_profile 
      WHERE school_id = ANY($1)
    `,
      [sPair],
    );

    console.log(
      `   Found ${prodPersonnel.rows.length} standardized personnel in PROD.`,
    );

    const newIds = prodPersonnel.rows.map((r) => r.id);

    // Insert personnel into STAGING
    for (const r of prodPersonnel.rows) {
      const insertCols = pCols.map((c) => `"${c}"`).join(", ");
      const placeholders = pCols.map((_, i) => `$${i + 1}`).join(", ");
      const vals = pCols.map((c) => sanitizeValue(r[c], pColTypes[c]));
      await staging.query(
        `
        INSERT INTO esf7_personnel_profile (${insertCols})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET
          prn = EXCLUDED.prn,
          employee_no = EXCLUDED.employee_no,
          legacy_id = EXCLUDED.legacy_id,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          updated_at = NOW();
      `,
        vals,
      );
    }
    console.log(
      `   ✓ Copied ${prodPersonnel.rows.length} standardized personnel into staging.esf7_personnel_profile`,
    );

    // 3. Copy Child Tables
    const childTables = [
      "esf7_personnel_employment",
      "esf7_perssonel_educ",
      "esf7_personnel_ld_trainings",
      "esf7_personnel_learning_areas",
    ];

    for (const ct of childTables) {
      console.log(`📦 Copying ${ct}...`);
      const colsRes = await prod.query(
        `
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_name = $1 ORDER BY ordinal_position
      `,
        [ct],
      );
      const cols = colsRes.rows.map((r) => r.column_name);
      const colTypes = Object.fromEntries(
        colsRes.rows.map((r) => [r.column_name, r.data_type]),
      );

      const rowsRes = await prod.query(
        `
        SELECT ${cols.map((c) => `"${c}"`).join(", ")} 
        FROM ${ct} 
        WHERE personnel_id = ANY($1)
      `,
        [newIds],
      );

      console.log(`   Found ${rowsRes.rows.length} rows in PROD.${ct}`);
      for (const r of rowsRes.rows) {
        const insertCols = cols.map((c) => `"${c}"`).join(", ");
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const vals = cols.map((c) => sanitizeValue(r[c], colTypes[c]));
        await staging.query(
          `
          INSERT INTO ${ct} (${insertCols})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING;
        `,
          vals,
        );
      }
      console.log(`   ✓ Copied ${rowsRes.rows.length} rows into staging.${ct}`);
    }

    // 4. Copy Workload Rows
    console.log("📦 Copying esf7_workload_rows...");
    const wColsRes = await prod.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'esf7_workload_rows' ORDER BY ordinal_position
    `);
    const wCols = wColsRes.rows.map((r) => r.column_name);
    const wColTypes = Object.fromEntries(
      wColsRes.rows.map((r) => [r.column_name, r.data_type]),
    );

    const wRes = await prod.query(
      `
      SELECT ${wCols.map((c) => `"${c}"`).join(", ")} 
      FROM esf7_workload_rows 
      WHERE school_id = ANY($1)
    `,
      [sPair],
    );

    console.log(`   Found ${wRes.rows.length} workload rows in PROD.`);
    for (const r of wRes.rows) {
      const insertCols = wCols.map((c) => `"${c}"`).join(", ");
      const placeholders = wCols.map((_, i) => `$${i + 1}`).join(", ");
      const vals = wCols.map((c) => sanitizeValue(r[c], wColTypes[c]));
      await staging.query(
        `
        INSERT INTO esf7_workload_rows (${insertCols})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING;
      `,
        vals,
      );
    }
    console.log(
      `   ✓ Copied ${wRes.rows.length} rows into staging.esf7_workload_rows`,
    );

    // 5. Verification
    console.log("\n=================== FINAL VERIFICATION ===================");
    for (const sch of TARGET_SCHOOLS) {
      const pCount = await staging.query(
        `SELECT count(*) FROM esf7_personnel_profile WHERE school_id IN ($1, $2)`,
        [sch, `SCH-${sch}`],
      );
      const wCount = await staging.query(
        `SELECT count(*) FROM esf7_workload_rows WHERE school_id IN ($1, $2)`,
        [sch, `SCH-${sch}`],
      );
      const rSecCount = await staging.query(
        `SELECT count(*) FROM esf7_regular_sections WHERE school_id IN ($1, $2)`,
        [sch, `SCH-${sch}`],
      );
      console.log(
        `School ${sch}: Personnel=${pCount.rows[0].count}, Workloads=${wCount.rows[0].count}, RegularSections=${rSecCount.rows[0].count}`,
      );
    }

    const sampleP = await staging.query(`
      SELECT id, prn, employee_no, legacy_id, first_name, last_name 
      FROM esf7_personnel_profile 
      WHERE school_id IN ('300488', 'SCH-300488') 
      ORDER BY last_name, first_name 
      LIMIT 3
    `);
    console.log("\nStandardized Personnel Sample in STAGING for 300488:");
    console.log(sampleP.rows);

    console.log("\n✅ Done!");
  } catch (err) {
    console.error("Sync error:", err);
  } finally {
    await prod.end();
    await staging.end();
    process.exit(0);
  }
}

run();
