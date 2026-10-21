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

function formatType(c) {
  if (c.data_type === "character varying") {
    return c.character_maximum_length
      ? `varchar(${c.character_maximum_length})`
      : "varchar";
  }
  if (c.data_type === "USER-DEFINED") {
    return c.udt_name;
  }
  return c.data_type;
}

async function syncSchema() {
  console.log("=== STARTING SAFE SCHEMA SYNC TO insighted_esf7 ===");

  // 1. Base tables in both
  const qTables = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name NOT LIKE '_backup_%' AND table_name NOT LIKE 'backup_%';
  `;
  const [tStaging, tProd] = await Promise.all([
    poolStaging.query(qTables),
    poolProd.query(qTables),
  ]);

  const prodBaseTables = new Set(tProd.rows.map((r) => r.table_name));

  // 2. Missing columns
  const qCols = `
    SELECT table_name, column_name, data_type, udt_name, column_default, is_nullable, character_maximum_length
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `;
  const [cStaging, cProd] = await Promise.all([
    poolStaging.query(qCols),
    poolProd.query(qCols),
  ]);

  const prodColSet = new Set(
    cProd.rows.map((r) => `${r.table_name}.${r.column_name}`),
  );

  const missingCols = [];
  for (const c of cStaging.rows) {
    if (
      c.table_name.startsWith("_backup_") ||
      c.table_name.startsWith("backup_")
    )
      continue;
    if (!prodBaseTables.has(c.table_name)) continue;

    const key = `${c.table_name}.${c.column_name}`;
    if (!prodColSet.has(key)) {
      missingCols.push(c);
    }
  }

  console.log(
    `Found ${missingCols.length} missing columns across existing base tables in production.`,
  );

  // Apply column additions one by one
  let addedCount = 0;
  for (const col of missingCols) {
    const typeStr = formatType(col);
    let ddl = `ALTER TABLE "${col.table_name}" ADD COLUMN IF NOT EXISTS "${col.column_name}" ${typeStr}`;
    if (col.column_default) {
      ddl += ` DEFAULT ${col.column_default}`;
    }

    try {
      await poolProd.query(ddl);
      addedCount++;
      if (addedCount % 25 === 0 || col.table_name !== "esf7_database") {
        console.log(
          `[OK] (${addedCount}/${missingCols.length}) ${col.table_name}.${col.column_name} (${typeStr})`,
        );
      }
    } catch (err) {
      console.error(
        `[ERROR] Failed to add ${col.table_name}.${col.column_name}:`,
        err.message,
      );
    }
  }
  console.log(`Successfully added/verified ${addedCount} columns.`);

  // 3. Views
  const qViews = `
    SELECT table_name, view_definition 
    FROM information_schema.views 
    WHERE table_schema = 'public';
  `;
  const [vStaging, vProd] = await Promise.all([
    poolStaging.query(qViews),
    poolProd.query(qViews),
  ]);
  const prodViewSet = new Set(vProd.rows.map((r) => r.table_name));

  for (const v of vStaging.rows) {
    if (!prodViewSet.has(v.table_name) && !prodBaseTables.has(v.table_name)) {
      console.log(`Creating missing view: ${v.table_name}`);
      try {
        await poolProd.query(
          `CREATE OR REPLACE VIEW "${v.table_name}" AS ${v.view_definition.trim()}`,
        );
        console.log(`[OK] View ${v.table_name} created successfully.`);
      } catch (err) {
        console.error(
          `[ERROR] Failed to create view ${v.table_name}:`,
          err.message,
        );
      }
    }
  }

  // 4. Check esf7_database_dummy
  if (!prodBaseTables.has("esf7_database_dummy")) {
    console.log(
      "Creating table esf7_database_dummy (LIKE esf7_database INCLUDING ALL)...",
    );
    try {
      await poolProd.query(
        `CREATE TABLE IF NOT EXISTS esf7_database_dummy (LIKE esf7_database INCLUDING ALL);`,
      );
      console.log("[OK] esf7_database_dummy created.");
    } catch (err) {
      console.error(
        "[ERROR] Failed to create esf7_database_dummy:",
        err.message,
      );
    }
  }

  console.log("\n=== SCHEMA SYNC COMPLETE ===");
  await poolStaging.end();
  await poolProd.end();
}

syncSchema().catch(console.error);
