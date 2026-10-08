const { Client } = require('pg');

const PROD_URL = 'postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require';
const STAGING_URL = 'postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7_staging?sslmode=require';

async function verifyIsolation() {
  const prodClient = new Client({ connectionString: PROD_URL });
  const stagingClient = new Client({ connectionString: STAGING_URL });

  await prodClient.connect();
  await stagingClient.connect();

  console.log('🧪 Verifying database isolation between Staging & Production...');

  const testId = `WKL-TEST-ISO-${Date.now()}`;

  // 1. Insert test row into STAGING
  await stagingClient.query(`
    INSERT INTO esf7_workload_rows (id, personnel_id, school_id, school_year, subject, term, days)
    VALUES ($1, 'PER-100115-001', '100115', 'SY 26-27', 'ISOLATION TEST SUBJECT', '1st', '["M","T"]'::jsonb)
  `, [testId]);

  console.log(`✅ Inserted test row [${testId}] into insighted_esf7_staging.`);

  // 2. Query PROD to verify 0 rows found
  const prodRes = await prodClient.query('SELECT * FROM esf7_workload_rows WHERE id = $1', [testId]);
  console.log(`🔍 Production lookup for [${testId}]: Found ${prodRes.rows.length} rows.`);

  if (prodRes.rows.length === 0) {
    console.log('🎉 PERFECT ISOLATION: Production is completely untouched by staging changes!');
  } else {
    console.error('❌ ISOLATION FAILURE: Staging write leaked into production!');
    process.exit(1);
  }

  // 3. Clean up test row from staging
  await stagingClient.query('DELETE FROM esf7_workload_rows WHERE id = $1', [testId]);
  console.log('🧹 Cleaned up isolation test record from staging.');

  await prodClient.end();
  await stagingClient.end();
}

verifyIsolation().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
