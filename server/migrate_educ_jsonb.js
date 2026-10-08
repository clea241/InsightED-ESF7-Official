const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function migrateDatabase(dbName) {
  console.log(`Connecting to '${dbName}' for education JSONB migration...`);

  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: dbName,
    ssl: sslConfig
  });

  try {
    await client.connect();
    console.log(`Connected to '${dbName}'. Executing DDL migration...`);

    // 1. Add college_degrees JSONB column if it doesn't exist
    await client.query(`
      ALTER TABLE esf7_perssonel_educ 
      ADD COLUMN IF NOT EXISTS college_degrees JSONB DEFAULT '[]'::jsonb;
    `);
    console.log(`- Column 'college_degrees' verified in ${dbName}.`);

    // 2. Backfill college_degrees from existing college_degree, major, minor
    await client.query(`
      UPDATE esf7_perssonel_educ
      SET college_degrees = jsonb_build_array(
        jsonb_build_object(
          'collegeDegree', college_degree,
          'major', COALESCE(major, ''),
          'minor', COALESCE(minor, '')
        )
      )
      WHERE (college_degrees IS NULL OR college_degrees = '[]'::jsonb)
        AND college_degree IS NOT NULL
        AND trim(college_degree) != ''
        AND upper(college_degree) NOT IN ('NONE', 'N/A');
    `);
    console.log(`- Backfilled existing 'college_degrees' rows in ${dbName}.`);

    // 3. Alter post_graduate_discipline column to JSONB
    await client.query(`
      DO $$
      BEGIN
        -- Check if post_graduate_discipline is not already jsonb
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'esf7_perssonel_educ' 
            AND column_name = 'post_graduate_discipline' 
            AND data_type != 'jsonb'
        ) THEN
          ALTER TABLE esf7_perssonel_educ 
          ALTER COLUMN post_graduate_discipline TYPE JSONB 
          USING (
            CASE 
              WHEN post_graduate_discipline IS NULL OR trim(post_graduate_discipline) = '' OR trim(post_graduate_discipline) = 'N/A' OR trim(post_graduate_discipline) = 'NONE' THEN '{}'::jsonb
              WHEN trim(post_graduate_discipline) LIKE '{%' THEN post_graduate_discipline::jsonb
              WHEN trim(post_graduate_discipline) LIKE '[%' THEN jsonb_build_object('mastersGraduated', post_graduate_discipline::jsonb)
              ELSE jsonb_build_object('mastersGraduated', to_jsonb(string_to_array(post_graduate_discipline, ', ')))
            END
          );
          ALTER TABLE esf7_perssonel_educ ALTER COLUMN post_graduate_discipline SET DEFAULT '{}'::jsonb;
        END IF;
      END $$;
    `);
    console.log(`- Column 'post_graduate_discipline' successfully converted to JSONB in ${dbName}.`);

    // 4. Create GIN Indexes for high-performance JSON querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_esf7_perssonel_educ_college_degrees 
      ON esf7_perssonel_educ USING gin (college_degrees);

      CREATE INDEX IF NOT EXISTS idx_esf7_perssonel_educ_post_grad_disc 
      ON esf7_perssonel_educ USING gin (post_graduate_discipline);
    `);
    console.log(`- GIN Indexes created successfully in ${dbName}.`);

  } catch (err) {
    console.error(`Error migrating database '${dbName}':`, err.message);
  } finally {
    await client.end();
  }
}

async function run() {
  const databases = ['insighted_esf7', 'esf7_database_dummy'];
  for (const db of databases) {
    await migrateDatabase(db);
  }
  console.log('Migration process completed!');
}

run();
