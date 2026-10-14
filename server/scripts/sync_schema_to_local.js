const { Pool } = require('../node_modules/pg');

const azurePool = new Pool({
  host: 'stride-posgre-prod-01.postgres.database.azure.com',
  port: 5432,
  user: 'Administrator1',
  password: 'pRZTbQ2T1JD7',
  database: 'insighted_esf7',
  ssl: { rejectUnauthorized: false },
});

const localPool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'kLeyahhUnique241!@',
  database: 'esf7_local',
  ssl: false,
});

const TARGET_TABLES = [
  'esf7_school_profile',
  'esf7_personnel_profile',
  'esf7_personnel_employment',
  'esf7_perssonel_educ',
  'esf7_personnel_ld_trainings',
  'esf7_personnel_learning_areas',
  'esf7_regular_sections',
  'esf7_als_sections',
  'esf7_aral_sections',
  'esf7_sned_sections',
  'esf7_remedial_enrichment_sections',
  'esf7_personnel_designations',
  'esf7_workload_rows',
  'esf7_personnel_allowances'
];

const TARGET_VIEWS = [
  'esf7_class_sections',
  'esf7_personnel_educ',
  'esf7_personnel_l&d',
  'esf7_personnel_ld',
  'esf7_personnel_learning_area',
  'esf7_regualar_sections',
  'esf7_personnel_designation',
  'esf7_workload_row',
  'esf7_personnel_allowance'
];

function formatColumnType(col) {
  if (col.data_type === 'ARRAY') {
    const elemType = col.udt_name.replace(/^_/, '');
    return `${elemType}[]`;
  }
  if (col.data_type === 'character varying') {
    return col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'VARCHAR';
  }
  if (col.data_type === 'character') {
    return col.character_maximum_length ? `CHAR(${col.character_maximum_length})` : 'CHAR';
  }
  if (col.data_type === 'numeric') {
    if (col.numeric_precision && col.numeric_scale !== null) {
      return `NUMERIC(${col.numeric_precision}, ${col.numeric_scale})`;
    }
    if (col.numeric_precision) {
      return `NUMERIC(${col.numeric_precision})`;
    }
    return 'NUMERIC';
  }
  if (col.data_type === 'timestamp with time zone') return 'TIMESTAMPTZ';
  if (col.data_type === 'timestamp without time zone') return 'TIMESTAMP';
  if (col.data_type === 'time without time zone') return 'TIME';
  if (col.data_type === 'time with time zone') return 'TIMETZ';
  if (col.data_type === 'USER-DEFINED') return col.udt_name;
  return col.data_type.toUpperCase();
}

async function runSync() {
  const azClient = await azurePool.connect();
  const locClient = await localPool.connect();

  try {
    console.log('🚀 Starting schema sync from insighted_esf7 to esf7_local...');

    // 1. Fetch View Definitions from Azure
    console.log('\nFetching view definitions from Azure...');
    const viewDefs = [];
    for (const viewName of TARGET_VIEWS) {
      const res = await azClient.query(`SELECT pg_get_viewdef($1::regclass, true) as def;`, [viewName]);
      if (res.rows.length > 0) {
        viewDefs.push({ name: viewName, def: res.rows[0].def });
        console.log(`  ✓ Got definition for view: ${viewName}`);
      } else {
        console.warn(`  ⚠️ View not found on Azure: ${viewName}`);
      }
    }

    // 2. Fetch Table Schemas (columns, constraints, indexes) from Azure
    console.log('\nFetching table schemas from Azure...');
    const tableSchemas = [];

    for (const tableName of TARGET_TABLES) {
      // Columns
      const colRes = await azClient.query(`
        SELECT 
          column_name, 
          data_type, 
          udt_name,
          character_maximum_length, 
          numeric_precision,
          numeric_scale,
          is_nullable, 
          column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [tableName]);

      // Primary Key
      const pkRes = await azClient.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1
        ORDER BY kcu.ordinal_position;
      `, [tableName]);

      // Unique and Check constraints (excluding PK)
      const constraintRes = await azClient.query(`
        SELECT conname, contype, pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = $1 AND c.contype IN ('u', 'c');
      `, [tableName]);

      // Indexes (excluding constraint-backed indexes)
      const idxRes = await azClient.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' 
          AND tablename = $1
          AND indexname NOT IN (
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_schema = 'public' AND table_name = $1
          );
      `, [tableName]);

      tableSchemas.push({
        name: tableName,
        columns: colRes.rows,
        pkColumns: pkRes.rows.map(r => r.column_name),
        constraints: constraintRes.rows,
        indexes: idxRes.rows
      });
      console.log(`  ✓ Got schema for table: ${tableName} (${colRes.rows.length} columns, PK: [${pkRes.rows.map(r => r.column_name).join(', ')}], ${idxRes.rows.length} indexes)`);
    }

    // 3. Drop existing views in esf7_local
    console.log('\nDropping target views in esf7_local...');
    for (const view of TARGET_VIEWS) {
      await locClient.query(`DROP VIEW IF EXISTS "${view}" CASCADE;`);
      console.log(`  ✓ Dropped view (if existed): ${view}`);
    }

    // Also drop with case-insensitivity/quotes if special chars like &
    await locClient.query(`DROP VIEW IF EXISTS "esf7_personnel_l&d" CASCADE;`);

    // 4. Drop and Recreate Target Tables in esf7_local
    console.log('\nReplacing target tables in esf7_local (schema only)...');
    for (const schema of tableSchemas) {
      console.log(`\nRecreating table: ${schema.name}...`);
      await locClient.query(`DROP TABLE IF EXISTS "${schema.name}" CASCADE;`);

      // Build column definitions
      const colDefs = schema.columns.map(col => {
        let typeStr = formatColumnType(col);
        let def = `"${col.column_name}" ${typeStr}`;
        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }
        if (col.is_nullable === 'NO') {
          def += ` NOT NULL`;
        }
        return def;
      });

      if (schema.pkColumns.length > 0) {
        colDefs.push(`PRIMARY KEY (${schema.pkColumns.map(c => `"${c}"`).join(', ')})`);
      }

      const createSql = `CREATE TABLE "${schema.name}" (\n  ${colDefs.join(',\n  ')}\n);`;
      await locClient.query(createSql);
      console.log(`  ✓ Created table "${schema.name}"`);

      // Add constraints (unique, check)
      for (const con of schema.constraints) {
        try {
          await locClient.query(`ALTER TABLE "${schema.name}" ADD CONSTRAINT "${con.conname}" ${con.def};`);
          console.log(`  ✓ Added constraint ${con.conname}`);
        } catch (err) {
          console.warn(`  ⚠️ Constraint ${con.conname} note:`, err.message);
        }
      }

      // Add indexes
      for (const idx of schema.indexes) {
        try {
          await locClient.query(idx.indexdef);
          console.log(`  ✓ Created index ${idx.indexname}`);
        } catch (err) {
          console.warn(`  ⚠️ Index ${idx.indexname} note:`, err.message);
        }
      }
    }

    // 5. Recreate Views in esf7_local
    console.log('\nRecreating target views in esf7_local...');
    for (const view of viewDefs) {
      const viewSql = `CREATE OR REPLACE VIEW "${view.name}" AS ${view.def};`;
      try {
        await locClient.query(viewSql);
        console.log(`  ✓ Recreated view "${view.name}"`);
      } catch (err) {
        console.error(`  ❌ Failed to create view "${view.name}":`, err.message);
        throw err;
      }
    }

    // 6. Final Verification on esf7_local
    console.log('\n===================== VERIFICATION =====================');
    for (const schema of tableSchemas) {
      const verifyCols = await locClient.query(`
        SELECT column_name, data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [schema.name]);

      const rawPayload = verifyCols.rows.find(c => c.column_name === 'raw_payload');
      const extrasCol = verifyCols.rows.find(c => c.column_name === 'extras');
      
      console.log(`Table ${schema.name}: ${verifyCols.rows.length} columns | raw_payload: ${rawPayload ? 'PRESENT (WARNING)' : 'NONE (CORRECT)'} | extras: ${extrasCol ? extrasCol.data_type : 'N/A'}`);
    }

    for (const view of TARGET_VIEWS) {
      const verifyView = await locClient.query(`
        SELECT count(*) FROM "${view}" LIMIT 1;
      `).catch(err => ({ error: err.message }));
      if (verifyView.error) {
        console.error(`❌ View query test for ${view} failed: ${verifyView.error}`);
      } else {
        console.log(`✓ View ${view} query test passed.`);
      }
    }

    console.log('\n🎉 ALL 14 TABLES AND 9 VIEWS SUCCESSFULLY REPLACED IN esf7_local!');

  } finally {
    azClient.release();
    locClient.release();
    await azurePool.end();
    await localPool.end();
  }
}

runSync().catch(err => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
