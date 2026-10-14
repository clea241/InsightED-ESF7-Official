/**
 * High-Speed Wire Copy: insightEd.esf7_database -> insighted_esf7_staging.esf7_database
 * 
 * Rules:
 * - Read-only on insightEd (never write, alter, or drop anything in insightEd)
 * - Target: insighted_esf7_staging only
 * - Streams all 415 columns and 1,001,689 records via pg-copy-streams
 */

const { Pool } = require('pg');
const { pipeline } = require('stream/promises');
const { to: copyTo, from: copyFrom } = require('pg-copy-streams');

const plan = require('../migration_esf7_2.0_plan.json');

const SOURCE_URL = 'postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insightEd?sslmode=require';
const STAGING_URL = 'postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7_staging?sslmode=require';

async function run() {
  console.log('======================================================');
  console.log('🚀 Copying esf7_database -> insighted_esf7_staging');
  console.log('   Source: insightEd (Read-Only)');
  console.log('   Target: insighted_esf7_staging');
  console.log('======================================================');

  const sourcePool = new Pool({ connectionString: SOURCE_URL, max: 2 });
  const targetPool = new Pool({ connectionString: STAGING_URL, max: 2 });

  let sourceClient = null;
  let targetClient = null;

  try {
    sourceClient = await sourcePool.connect();
    targetClient = await targetPool.connect();

    // 1. Get source count
    const srcCountRes = await sourceClient.query('SELECT count(1)::bigint as total FROM esf7_database');
    const totalSourceRows = Number(srcCountRes.rows[0].total);
    console.log(`📊 Source esf7_database has ${totalSourceRows.toLocaleString()} rows.`);

    // 2. Prepare target table in staging
    console.log('🔨 Recreating table "esf7_database" with full 415-column schema in staging...');
    await targetClient.query('DROP TABLE IF EXISTS "esf7_database" CASCADE;');

    // DDL with target table name "esf7_database" without PK during fast copy
    const targetDdl = plan.ddl
      .replace(/"esf7_database_2\.0"/g, '"esf7_database"')
      .replace('"id" VARCHAR(128) PRIMARY KEY', '"id" VARCHAR(128)');
    await targetClient.query(targetDdl);

    // 3. Setup streaming COPY
    console.log('⏳ Starting high-speed wire COPY stream (Azure internal)...');
    const startTime = Date.now();

    const copyToSql = `COPY (SELECT ${plan.selectCols.join(', ')} FROM esf7_database) TO STDOUT WITH (FORMAT csv, HEADER false)`;
    const copyFromSql = `COPY "esf7_database" (${plan.targetCols.join(', ')}) FROM STDIN WITH (FORMAT csv, HEADER false)`;

    const sourceStream = sourceClient.query(copyTo(copyToSql));
    const targetStream = targetClient.query(copyFrom(copyFromSql));

    let bytesTransferred = 0;
    let lastLog = Date.now();

    sourceStream.on('data', (chunk) => {
      bytesTransferred += chunk.length;
      if (Date.now() - lastLog > 5000) {
        lastLog = Date.now();
        const mb = (bytesTransferred / (1024 * 1024)).toFixed(1);
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`   Transferred ~${mb} MB in ${elapsedSec}s...`);
      }
    });

    await pipeline(sourceStream, targetStream);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalMb = (bytesTransferred / (1024 * 1024)).toFixed(1);
    console.log(`✅ Stream completed: ${totalMb} MB transferred in ${elapsed}s!`);

    // 4. Verify target count
    const targetCountRes = await targetClient.query('SELECT count(1)::bigint as total FROM "esf7_database"');
    const targetCount = Number(targetCountRes.rows[0].total);
    console.log(`📊 Target rows in staging "esf7_database": ${targetCount.toLocaleString()}`);

    // 5. Create performance indexes for lookups
    console.log('⚡ Creating query performance indexes on staging "esf7_database"...');
    await targetClient.query('CREATE INDEX IF NOT EXISTS "idx_esf7_db_school_id" ON "esf7_database" (school_id);');
    await targetClient.query('CREATE INDEX IF NOT EXISTS "idx_esf7_db_schoool_id" ON "esf7_database" (schoool_id);');
    await targetClient.query('CREATE INDEX IF NOT EXISTS "idx_esf7_db_employee_no" ON "esf7_database" (employee_no);');
    await targetClient.query('CREATE INDEX IF NOT EXISTS "idx_esf7_db_last_first" ON "esf7_database" (last_first);');
    console.log('✅ Indexes created successfully!');

    console.log('🎉 esf7_database is now fully populated in insighted_esf7_staging!');
  } catch (err) {
    console.error('❌ Copy failed:', err);
    throw err;
  } finally {
    if (sourceClient) sourceClient.release();
    if (targetClient) targetClient.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
