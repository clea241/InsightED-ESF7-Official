require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Pool } = require("../node_modules/pg");

const prodPool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: process.env.DB_PASSWORD,
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
});

const stagingPool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: process.env.DB_PASSWORD,
  database: "insighted_esf7_staging",
  ssl: { rejectUnauthorized: false },
});

const TARGET_TABLES = [
  "esf7_school_profile",
  "esf7_personnel_profile",
  "esf7_personnel_employment",
  "esf7_perssonel_educ",
  "esf7_personnel_ld_trainings",
  "esf7_personnel_learning_areas",
  "esf7_regular_sections",
  "esf7_als_sections",
  "esf7_aral_sections",
  "esf7_sned_sections",
  "esf7_remedial_enrichment_sections",
  "esf7_personnel_designations",
  "esf7_workload_rows",
  "esf7_personnel_allowances",
];

async function compare() {
  const prodClient = await prodPool.connect();
  const stagingClient = await stagingPool.connect();

  try {
    for (const t of TARGET_TABLES) {
      const prodCols = await prodClient.query(
        `
        SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `,
        [t],
      );

      const stagingCols = await stagingClient.query(
        `
        SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `,
        [t],
      );

      const stagingCount = await stagingClient
        .query(`SELECT count(*) FROM "${t}"`)
        .catch((e) => ({ rows: [{ count: "ERROR: " + e.message }] }));

      console.log(
        `\n=== Table: ${t} (${stagingCount.rows[0].count} rows in staging) ===`,
      );
      console.log(
        `  Prod cols: ${prodCols.rows.length}, Staging cols: ${stagingCols.rows.length}`,
      );

      const prodNames = prodCols.rows.map((c) => c.column_name);
      const stagingNames = stagingCols.rows.map((c) => c.column_name);

      const missingInStaging = prodNames.filter(
        (c) => !stagingNames.includes(c),
      );
      const extraInStaging = stagingNames.filter((c) => !prodNames.includes(c));

      if (missingInStaging.length > 0)
        console.log(`  Missing in staging:`, missingInStaging);
      if (extraInStaging.length > 0)
        console.log(`  Extra in staging:`, extraInStaging);
    }
  } finally {
    prodClient.release();
    stagingClient.release();
    await prodPool.end();
    await stagingPool.end();
  }
}

compare().catch(console.error);
