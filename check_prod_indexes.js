const { Client } = require("./server/node_modules/pg");

async function check() {
  const client = new Client({
    connectionString:
      "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require",
  });
  await client.connect();

  const tables = [
    "esf7_personnel_designations",
    "esf7_regular_sections",
    "esf7_sned_sections",
    "esf7_als_sections",
    "esf7_school_profile",
    "esf7_personnel_profile",
    "esf7_personnel_employment",
    "esf7_perssonel_educ",
    "esf7_workload_rows",
  ];

  for (const table of tables) {
    const indexes = await client.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1",
      [table],
    );
    console.log(`\n=== ${table} ===`);
    indexes.rows.forEach((r) =>
      console.log("  " + r.indexname + ": " + r.indexdef),
    );
  }

  await client.end();
}

check().catch(console.error);
