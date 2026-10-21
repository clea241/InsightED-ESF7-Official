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
    "esf7_regular_sections",
    "esf7_personnel_employment",
    "esf7_requests",
    "esf7_personnel_learning_areas",
  ];

  for (const table of tables) {
    console.log("\n=================== " + table + " ===================");
    const cols = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1",
      [table],
    );
    console.log(
      "COLUMNS:",
      cols.rows.map((r) => r.column_name + " (" + r.data_type + ")").join(", "),
    );

    const constraints = await client.query(
      `
      SELECT conname, contype, pg_get_constraintdef(c.oid) as def 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = $1
    `,
      [table],
    );
    console.log("CONSTRAINTS:");
    constraints.rows.forEach((r) =>
      console.log("  " + r.conname + " [" + r.contype + "]: " + r.def),
    );

    const indexes = await client.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1",
      [table],
    );
    console.log("INDEXES:");
    indexes.rows.forEach((r) =>
      console.log("  " + r.indexname + ": " + r.indexdef),
    );
  }

  await client.end();
}

check().catch(console.error);
