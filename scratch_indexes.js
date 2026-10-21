const path = require("path");
const { Client } = require(
  path.join(__dirname, "server", "node_modules", "pg"),
);

async function check() {
  const client = new Client({
    connectionString:
      "postgresql://postgres:kLeyahhUnique241!%40@127.0.0.1:5432/esf7_local",
  });
  await client.connect();

  const tables = [
    "esf7_sned_sections",
    "esf7_als_sections",
    "esf7_remedial_sections",
    "esf7_aral_sections",
    "esf7_school_profile",
    "esf7_personnel_profile",
    "esf7_personnel_employment",
    "esf7_perssonel_educ",
    "esf7_personnel_designations",
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
