require("../db/directPort");
const { Pool } = require("pg");

const BASE =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/";
const poolStaging = new Pool({
  connectionString: BASE + "insighted_esf7_staging?sslmode=require",
});
const poolProd = new Pool({
  connectionString: BASE + "insighted_esf7?sslmode=require",
});

async function check() {
  const qCols = `SELECT table_name, column_name, data_type, udt_name, column_default, is_nullable, character_maximum_length FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;`;
  const [cStaging, cProd] = await Promise.all([
    poolStaging.query(qCols),
    poolProd.query(qCols),
  ]);
  const prodColMap = new Set(
    cProd.rows.map((r) => r.table_name + "." + r.column_name),
  );

  const byTable = {};
  for (const r of cStaging.rows) {
    if (!prodColMap.has(r.table_name + "." + r.column_name)) {
      byTable[r.table_name] = byTable[r.table_name] || [];
      byTable[r.table_name].push(r);
    }
  }

  for (const [t, cols] of Object.entries(byTable)) {
    console.log(`\nTable: "${t}" (${cols.length} missing columns):`);
    console.log(
      cols
        .map(
          (c) =>
            `  - ${c.column_name} (${c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type}${c.character_maximum_length ? "(" + c.character_maximum_length + ")" : ""}) DEFAULT ${c.column_default}`,
        )
        .join("\n"),
    );
  }
  await poolStaging.end();
  await poolProd.end();
}
check().catch(console.error);
