/**
 * Migration: Copy esf7_database from insightEd to insighted_esf7 as "esf7_database_2.0"
 * 
 * Rules:
 * - Read-only from insightEd (never write, alter, or drop anything in insightEd)
 * - Target: insighted_esf7 only
 * - Target table name: "esf7_database_2.0"
 * - Primary Key: "id" containing the source record's "esf7_id"
 * - Preserves all 415 original columns
 */

const { Pool } = require('pg');
const { pipeline } = require('stream/promises');
const { to: copyTo, from: copyFrom } = require('pg-copy-streams');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const plan = require('../migration_esf7_2.0_plan.json');

async function migrate() {
  console.log('======================================================');
  console.log('🚀 [Migration] Copying esf7_database -> "esf7_database_2.0"');
  console.log('   Source: insightEd (Read-Only)');
  console.log('   Target: insighted_esf7');
  console.log('======================================================');

  const sourcePool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'insightEd',
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 30000,
  });

  const targetPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'insighted_esf7',
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 30000,
  });

  let sourceClient = null;
  let targetClient = null;

  try {
    console.log('📦 Connecting to source (insightEd) and target (insighted_esf7)...');
    sourceClient = await sourcePool.connect();
    targetClient = await targetPool.connect();

    // 1. Get count on source
    const countRes = await sourceClient.query('SELECT count(*)::bigint as total FROM esf7_database;');
    const totalSourceRows = Number(countRes.rows[0].total);
    console.log(`📊 Source esf7_database has ${totalSourceRows.toLocaleString()} rows.`);

    // 2. Prepare target table in insighted_esf7 without constraints initially for max copy speed
    console.log('🔨 Ensuring table "esf7_database_2.0" exists in insighted_esf7...');
    // Replace PRIMARY KEY with nullable during bulk copy
    const tableDdlNoPk = plan.ddl.replace('"id" VARCHAR(128) PRIMARY KEY', '"id" VARCHAR(128)');
    await targetClient.query(tableDdlNoPk);

    // Check if target already has rows
    const existingTargetRes = await targetClient.query('SELECT count(*)::bigint as total FROM "esf7_database_2.0";');
    const existingTargetRows = Number(existingTargetRes.rows[0].total);
    if (existingTargetRows > 0) {
      console.log(`⚠️ Target "esf7_database_2.0" already has ${existingTargetRows.toLocaleString()} rows. Truncating target for clean copy...`);
      await targetClient.query('TRUNCATE TABLE "esf7_database_2.0";');
    }

    // 3. Setup streaming copy pipe
    console.log('⏳ Starting high-speed PostgreSQL wire COPY stream...');
    const startTime = Date.now();

    const copyToSql = `COPY (SELECT ${plan.selectCols.join(', ')} FROM esf7_database) TO STDOUT WITH (FORMAT csv, HEADER false)`;
    const copyFromSql = `COPY "esf7_database_2.0" (${plan.targetCols.join(', ')}) FROM STDIN WITH (FORMAT csv, HEADER false)`;

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

    const copyElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalMb = (bytesTransferred / (1024 * 1024)).toFixed(1);
    console.log(`✅ Streamed ${totalMb} MB in ${copyElapsed}s!`);

    // 4. Verify row count on target
    const targetCountRes = await targetClient.query('SELECT count(*)::bigint as total FROM "esf7_database_2.0";');
    const targetCount = Number(targetCountRes.rows[0].total);
    console.log(`📊 Target rows in "esf7_database_2.0": ${targetCount.toLocaleString()}`);

    // 5. Deduplicate any duplicate esf7_id before applying PRIMARY KEY
    console.log('🧹 Deduplicating any duplicate "id" (esf7_id) records if present...');
    const dedupRes = await targetClient.query(`
      DELETE FROM "esf7_database_2.0" a
      USING "esf7_database_2.0" b
      WHERE a.ctid < b.ctid AND a.id = b.id;
    `);
    console.log(`   Deduplicated ${dedupRes.rowCount} duplicate row(s).`);

    // 6. Apply PRIMARY KEY on "id"
    console.log('🔑 Adding PRIMARY KEY constraint on "id"...');
    await targetClient.query(`
      ALTER TABLE "esf7_database_2.0" ADD CONSTRAINT "esf7_database_2.0_pkey" PRIMARY KEY (id);
    `);
    console.log('✅ PRIMARY KEY ("id") added successfully.');

    // 7. Create Indexes
    console.log('⚡ Creating query performance indexes on "esf7_database_2.0"...');
    await targetClient.query(`CREATE INDEX IF NOT EXISTS "idx_esf7_db2_school_id" ON "esf7_database_2.0" (school_id);`);
    console.log('   ✓ Index on school_id created.');
    await targetClient.query(`CREATE INDEX IF NOT EXISTS "idx_esf7_db2_employee_no" ON "esf7_database_2.0" (employee_no);`);
    console.log('   ✓ Index on employee_no created.');
    await targetClient.query(`CREATE INDEX IF NOT EXISTS "idx_esf7_db2_esf7_id" ON "esf7_database_2.0" (esf7_id);`);
    console.log('   ✓ Index on esf7_id created.');
    await targetClient.query(`CREATE INDEX IF NOT EXISTS "idx_esf7_db2_last_first" ON "esf7_database_2.0" (last_first);`);
    console.log('   ✓ Index on last_first created.');

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('======================================================');
    console.log(`🎉 Migration Completed Successfully in ${totalElapsed}s!`);
    console.log(`   Total records in insighted_esf7."esf7_database_2.0": ${(targetCount - (dedupRes.rowCount || 0)).toLocaleString()}`);
    console.log('======================================================');

  } catch (err) {
    console.error('❌ Migration Error:', err);
    throw err;
  } finally {
    if (sourceClient) sourceClient.release();
    if (targetClient) targetClient.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate };
