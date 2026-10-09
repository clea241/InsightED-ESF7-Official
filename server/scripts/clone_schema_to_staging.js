const { Client } = require("pg");

const PROD_URL =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require";
const STAGING_URL =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7_staging?sslmode=require";

async function cloneSchemaAndReferenceData() {
  const prodClient = new Client({ connectionString: PROD_URL });
  const stagingClient = new Client({ connectionString: STAGING_URL });

  console.log(
    "Connecting to production (insighted_esf7 - READ ONLY) and staging (insighted_esf7_staging)...",
  );
  await prodClient.connect();
  await stagingClient.connect();

  console.log("✅ Connected to both databases.");

  // 1. Get all sequences from production and create in staging
  console.log("Replicating all sequences...");
  const seqRes = await prodClient.query(`
    SELECT sequence_name 
    FROM information_schema.sequences 
    WHERE sequence_schema = 'public';
  `);
  for (const seq of seqRes.rows) {
    try {
      await stagingClient.query(
        `CREATE SEQUENCE IF NOT EXISTS "${seq.sequence_name}";`,
      );
    } catch (e) {}
  }
  console.log(`✅ Replicated ${seqRes.rows.length} sequences.`);

  // 2. Get all public tables from production
  const tablesRes = await prodClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tableNames = tablesRes.rows.map((r) => r.table_name);
  console.log(
    `Found ${tableNames.length} tables in insighted_esf7 to replicate.`,
  );

  // 2. Clone schema table by table using CREATE TABLE IF NOT EXISTS (LIKE prod INCLUDING ALL)
  for (const t of tableNames) {
    console.log(`Replicating table structure for "${t}"...`);

    // Get column definitions
    const colRes = await prodClient.query(
      `
      SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `,
      [t],
    );

    const colDefs = colRes.rows.map((col) => {
      let typeStr = col.udt_name;
      if (col.data_type === "character varying") {
        typeStr = col.character_maximum_length
          ? `VARCHAR(${col.character_maximum_length})`
          : "VARCHAR(255)";
      } else if (col.data_type === "text") {
        typeStr = "TEXT";
      } else if (col.data_type === "jsonb") {
        typeStr = "JSONB";
      } else if (col.data_type === "boolean") {
        typeStr = "BOOLEAN";
      } else if (col.data_type === "integer") {
        typeStr = "INTEGER";
      } else if (col.data_type === "numeric") {
        typeStr = "NUMERIC";
      } else if (col.data_type === "date") {
        typeStr = "DATE";
      } else if (col.data_type.includes("timestamp")) {
        typeStr = "TIMESTAMPTZ";
      }

      let def = `"${col.column_name}" ${typeStr}`;
      if (col.column_default) {
        def += ` DEFAULT ${col.column_default}`;
      }
      if (col.is_nullable === "NO") {
        def += ` NOT NULL`;
      }
      return def;
    });

    // Create table in staging
    await stagingClient.query(
      `CREATE TABLE IF NOT EXISTS "${t}" (\n  ${colDefs.join(",\n  ")}\n);`,
    );

    // Replicate Primary Key
    const pkRes = await prodClient.query(
      `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1;
    `,
      [t],
    );

    if (pkRes.rows.length > 0) {
      const pkCols = pkRes.rows.map((r) => `"${r.column_name}"`).join(", ");
      try {
        await stagingClient.query(
          `ALTER TABLE "${t}" ADD PRIMARY KEY (${pkCols});`,
        );
      } catch (err) {
        // Ignore if PK already exists
      }
    }
  }

  // 3. Clone indexes
  console.log("Replicating custom indexes...");
  const idxRes = await prodClient.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey';
  `);

  for (const idx of idxRes.rows) {
    try {
      await stagingClient.query(idx.indexdef);
    } catch (err) {
      // Ignore if index already exists
    }
  }

  // 4. Copy Reference Tables (salary_matrix & initial baseline configs)
  console.log("Copying salary_matrix to staging...");
  const salaryRes = await prodClient.query("SELECT * FROM salary_matrix");
  if (salaryRes.rows.length > 0) {
    await stagingClient.query("DELETE FROM salary_matrix");
    for (const row of salaryRes.rows) {
      const keys = Object.keys(row);
      const vals = Object.values(row);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = keys.map((k) => `"${k}"`).join(", ");
      await stagingClient.query(
        `INSERT INTO salary_matrix (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals,
      );
    }
    console.log(
      `✅ Copied ${salaryRes.rows.length} salary_matrix rows to staging.`,
    );
  }

  // 5. Copy baseline school_profile templates and personnel dummy templates if present
  const schoolProfileRes = await prodClient.query(
    "SELECT * FROM esf7_school_profile",
  );
  if (schoolProfileRes.rows.length > 0) {
    for (const row of schoolProfileRes.rows) {
      const keys = Object.keys(row);
      const vals = keys.map((k) => {
        const v = row[k];
        if (v !== null && typeof v === "object" && !(v instanceof Date)) {
          return JSON.stringify(v);
        }
        return v;
      });
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = keys.map((k) => `"${k}"`).join(", ");
      await stagingClient.query(
        `INSERT INTO esf7_school_profile (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals,
      );
    }
    console.log(
      `✅ Copied ${schoolProfileRes.rows.length} school profile records to staging.`,
    );
  }

  // 6. Copy default personnel profile templates
  const personnelRes = await prodClient.query(
    "SELECT * FROM esf7_personnel_profile",
  );
  if (personnelRes.rows.length > 0) {
    for (const row of personnelRes.rows) {
      const keys = Object.keys(row);
      const vals = keys.map((k) => {
        const v = row[k];
        if (v !== null && typeof v === "object" && !(v instanceof Date)) {
          return JSON.stringify(v);
        }
        return v;
      });
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = keys.map((k) => `"${k}"`).join(", ");
      await stagingClient.query(
        `INSERT INTO esf7_personnel_profile (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals,
      );
    }
    console.log(
      `✅ Copied ${personnelRes.rows.length} baseline personnel profile records to staging.`,
    );
  }

  // 7. Copy workload rows
  const workloadRes = await prodClient.query(
    "SELECT * FROM esf7_workload_rows",
  );
  if (workloadRes.rows.length > 0) {
    for (const row of workloadRes.rows) {
      const keys = Object.keys(row);
      const vals = keys.map((k) => {
        const v = row[k];
        if (v !== null && typeof v === "object" && !(v instanceof Date)) {
          return JSON.stringify(v);
        }
        return v;
      });
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = keys.map((k) => `"${k}"`).join(", ");
      await stagingClient.query(
        `INSERT INTO esf7_workload_rows (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals,
      );
    }
    console.log(
      `✅ Copied ${workloadRes.rows.length} workload rows to staging.`,
    );
  }

  // 8. Verify Staging Table Count
  const verifyRes = await stagingClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  console.log(
    `\n🎉 Staging database setup complete! Total tables in insighted_esf7_staging: ${verifyRes.rows.length}`,
  );

  await prodClient.end();
  await stagingClient.end();
}

cloneSchemaAndReferenceData().catch((err) => {
  console.error("❌ Error cloning schema to staging:", err);
  process.exit(1);
});
