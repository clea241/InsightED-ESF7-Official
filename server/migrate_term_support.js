const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function migrateTermSupport() {
  const targetDbName = 'insighted_esf7';
  console.log(`Connecting to '${targetDbName}'...`);

  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: targetDbName,
    ssl: sslConfig
  });

  await client.connect();

  try {
    console.log("Checking existing tables...");
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
    `);
    const tables = res.rows.map(r => r.table_name);
    console.log("Found tables:", tables);

    if (tables.includes('esf7_personnel_profile')) {
      await client.query(`ALTER TABLE esf7_personnel_profile ADD COLUMN IF NOT EXISTS term TEXT DEFAULT '1st';`);
      console.log("✓ Added term to esf7_personnel_profile");
    }

    if (tables.includes('esf7_regular_sections')) {
      await client.query(`ALTER TABLE esf7_regular_sections ADD COLUMN IF NOT EXISTS term TEXT DEFAULT '1st';`);
      console.log("✓ Added term to esf7_regular_sections");
    }

    if (tables.includes('esf7_aral_sections')) {
      await client.query(`ALTER TABLE esf7_aral_sections ADD COLUMN IF NOT EXISTS term TEXT DEFAULT '1st';`);
      console.log("✓ Added term to esf7_aral_sections");
    }

    if (tables.includes('esf7_remedial_enrichment_sections')) {
      await client.query(`ALTER TABLE esf7_remedial_enrichment_sections ADD COLUMN IF NOT EXISTS term TEXT DEFAULT '1st';`);
      console.log("✓ Added term to esf7_remedial_enrichment_sections");
    }

    if (tables.includes('esf7_class_sections')) {
      await client.query(`ALTER TABLE esf7_class_sections ADD COLUMN IF NOT EXISTS term TEXT DEFAULT '1st';`);
      console.log("✓ Added term to esf7_class_sections");
    }

    if (tables.includes('esf7_workload_rows')) {
      await client.query(`ALTER TABLE esf7_workload_rows ADD COLUMN IF NOT EXISTS term TEXT DEFAULT '1st';`);
      console.log("✓ Added term to esf7_workload_rows");
    }

    if (tables.includes('esf7_shs_workload_rows')) {
      await client.query(`ALTER TABLE esf7_shs_workload_rows ADD COLUMN IF NOT EXISTS term TEXT DEFAULT '1st';`);
      console.log("✓ Added term to esf7_shs_workload_rows");
    }

    // Create esf7_term_status
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_term_status (
          id VARCHAR(50) PRIMARY KEY,
          school_id TEXT NOT NULL,
          school_year TEXT NOT NULL,
          term TEXT NOT NULL DEFAULT '1st',
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED')),
          locked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_school_sy_term UNIQUE (school_id, school_year, term)
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_term_status_school_sy ON esf7_term_status (school_id, school_year);
    `);
    console.log("✓ Created esf7_term_status table");

    console.log("✅ Term support migration completed successfully!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

migrateTermSupport();
