require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Pool } = require("../node_modules/pg");

const azurePool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: process.env.DB_PASSWORD,
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
});

const localPool = new Pool({
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "kLeyahhUnique241!@",
  database: "esf7_local",
  ssl: false,
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

const TARGET_VIEWS = [
  "esf7_class_sections",
  "esf7_personnel_educ",
  "esf7_personnel_l&d",
  "esf7_personnel_ld",
  "esf7_personnel_learning_area",
  "esf7_regualar_sections",
  "esf7_personnel_designation",
  "esf7_workload_row",
  "esf7_personnel_allowance",
];

async function getTableDDL(client, tableName) {
  // Get columns
  const cols = await client.query(
    `
    SELECT column_name, data_type, udt_name, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `,
    [tableName],
  );

  // Get constraints
  const constraints = await client.query(
    `
    SELECT conname, contype, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = $1;
  `,
    [tableName],
  );

  // Get indexes
  const indexes = await client.query(
    `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = $1;
  `,
    [tableName],
  );

  return {
    cols: cols.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
  };
}

async function getViewDef(client, viewName) {
  const res = await client
    .query(
      `
    SELECT pg_get_viewdef($1::regclass, true) as def;
  `,
      [viewName],
    )
    .catch(() => ({ rows: [] }));
  return res.rows[0]?.def || null;
}

async function main() {
  const azClient = await azurePool.connect();
  const locClient = await localPool.connect();
  try {
    console.log("Comparing schemas between insighted_esf7 and esf7_local...");

    for (const t of TARGET_TABLES) {
      console.log(`\n=== Table: ${t} ===`);
      const azInfo = await getTableDDL(azClient, t);
      const locInfo = await getTableDDL(locClient, t);
      console.log(
        `Azure cols: ${azInfo.cols.length}, Local cols: ${locInfo.cols.length}`,
      );

      const azColNames = azInfo.cols.map((c) => c.column_name);
      const locColNames = locInfo.cols.map((c) => c.column_name);

      const missingInLocal = azColNames.filter((c) => !locColNames.includes(c));
      const extraInLocal = locColNames.filter((c) => !azColNames.includes(c));
      if (missingInLocal.length > 0)
        console.log(`  Missing in local:`, missingInLocal);
      if (extraInLocal.length > 0)
        console.log(`  Extra in local:`, extraInLocal);
    }

    console.log("\n=== Checking Target Views on Azure ===");
    for (const v of TARGET_VIEWS) {
      const def = await getViewDef(azClient, v);
      console.log(`View ${v}: ${def ? "EXISTS" : "NOT FOUND"}`);
    }
  } finally {
    azClient.release();
    locClient.release();
    await azurePool.end();
    await localPool.end();
  }
}

main().catch(console.error);
