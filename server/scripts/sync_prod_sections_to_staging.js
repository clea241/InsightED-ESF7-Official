const path = require("path");
const root = "e:\\InsightED - ESF7 Official";
const { Pool } = require(path.join(root, "node_modules", "pg"));

const PROD_URL =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require";
const STAGING_URL =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7_staging?sslmode=require";

const TARGET_SCHOOLS = ["300488", "342285"];

async function run() {
  console.log(
    "================================================================",
  );
  console.log(
    "🚀 Syncing Production Sections -> Staging for 300488 & 342285 ONLY",
  );
  console.log("   Source: insighted_esf7 (PROD - Read-Only)");
  console.log("   Target: insighted_esf7_staging (STAGING)");
  console.log(
    "================================================================",
  );

  const prodPool = new Pool({ connectionString: PROD_URL, max: 2 });
  const stagingPool = new Pool({ connectionString: STAGING_URL, max: 2 });

  const sectionTables = [
    "esf7_regular_sections",
    "esf7_sned_sections",
    "esf7_als_sections",
    "esf7_aral_sections",
    "esf7_remedial_enrichment_sections",
  ];

  try {
    // 1. Revert / Clear all section tables in STAGING
    console.log("🧹 Clearing all section tables in STAGING...");
    for (const t of sectionTables) {
      await stagingPool.query(`TRUNCATE TABLE ${t} CASCADE;`);
      console.log(`   ✓ Truncated staging.${t}`);
    }

    // 2. Copy data from PROD for target schools
    for (const t of sectionTables) {
      console.log(`\n📦 Processing ${t}...`);

      // Fetch columns from PROD
      const colRes = await prodPool.query(
        `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position;
      `,
        [t],
      );
      const cols = colRes.rows.map((r) => r.column_name);

      // Fetch rows for target schools
      const rowsRes = await prodPool.query(
        `
        SELECT ${cols.map((c) => `"${c}"`).join(", ")} 
        FROM ${t} 
        WHERE school_id IN ($1, $2, $3, $4);
      `,
        [
          TARGET_SCHOOLS[0],
          `SCH-${TARGET_SCHOOLS[0]}`,
          TARGET_SCHOOLS[1],
          `SCH-${TARGET_SCHOOLS[1]}`,
        ],
      );

      const rows = rowsRes.rows;
      console.log(`   Found ${rows.length} rows in PROD for target schools.`);

      let copied = 0;
      for (const row of rows) {
        const insertCols = cols.map((c) => `"${c}"`).join(", ");
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(", ");
        const values = cols.map((c) => row[c]);

        await stagingPool.query(
          `
          INSERT INTO ${t} (${insertCols})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING;
        `,
          values,
        );
        copied++;
      }
      console.log(`   ✓ Copied ${copied} rows into staging.${t}`);
    }

    // 3. Verification in STAGING
    console.log(
      "\n=================== VERIFICATION IN STAGING ===================",
    );
    for (const t of sectionTables) {
      for (const sch of TARGET_SCHOOLS) {
        const countRes = await stagingPool.query(
          `
          SELECT count(*) FROM ${t} WHERE school_id IN ($1, $2);
        `,
          [sch, `SCH-${sch}`],
        );
        console.log(`STAGING ${t} for ${sch}: ${countRes.rows[0].count} rows`);
      }
    }

    // Sample from 300488 regular sections
    const sample300 = await stagingPool.query(`
      SELECT id, grade_level, section_name, adviser_id, male_learners, female_learners, number_of_learners 
      FROM esf7_regular_sections 
      WHERE school_id IN ('300488', 'SCH-300488') 
      ORDER BY grade_level, section_name 
      LIMIT 3;
    `);
    console.log("\nSample STAGING regular sections for 300488:");
    console.log(sample300.rows);

    // Sample from 300488 als sections
    const sampleAls = await stagingPool.query(`
      SELECT id, grade_level, section_name, adviser_id, male_learners, female_learners, number_of_learners 
      FROM esf7_als_sections 
      WHERE school_id IN ('300488', 'SCH-300488') 
      LIMIT 2;
    `);
    console.log("\nSample STAGING ALS sections for 300488:");
    console.log(sampleAls.rows);

    console.log("\n✅ Done!");
  } catch (err) {
    console.error("Sync error:", err);
  } finally {
    await prodPool.end();
    await stagingPool.end();
    process.exit(0);
  }
}

run();
