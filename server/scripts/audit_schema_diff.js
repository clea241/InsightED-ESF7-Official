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

async function run() {
  const qCols = `
    SELECT table_name, column_name, data_type, udt_name, column_default, is_nullable, character_maximum_length
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    ORDER BY table_name, ordinal_position;
  `;
  const qTables = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  `;

  const [tStaging, tProd, cStaging, cProd] = await Promise.all([
    poolStaging.query(qTables),
    poolProd.query(qTables),
    poolStaging.query(qCols),
    poolProd.query(qCols),
  ]);

  const prodTableSet = new Set(tProd.rows.map((r) => r.table_name));
  const missingTables = tStaging.rows
    .map((r) => r.table_name)
    .filter((t) => !prodTableSet.has(t));

  const prodColMap = new Map();
  for (const r of cProd.rows) {
    prodColMap.set(`${r.table_name}.${r.column_name}`, r);
  }

  const missingColumns = [];
  for (const r of cStaging.rows) {
    // If the entire table is missing, handle separately
    if (missingTables.includes(r.table_name)) continue;
    const key = `${r.table_name}.${r.column_name}`;
    if (!prodColMap.has(key)) {
      missingColumns.push(r);
    }
  }

  console.log("=== MISSING TABLES ===");
  console.log(missingTables);
  console.log(
    `\n=== MISSING COLUMNS IN EXISTING TABLES (${missingColumns.length}) ===`,
  );
  console.table(
    missingColumns.map((c) => ({
      table: c.table_name,
      column: c.column_name,
      type: c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type,
      default: c.column_default,
      nullable: c.is_nullable,
    })),
  );

  await poolStaging.end();
  await poolProd.end();
}

run().catch(console.error);
