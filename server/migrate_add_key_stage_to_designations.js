const { Client } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const sslConfig =
  process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false;

async function migrateAddKeyStage() {
  const targetDbName = "insighted_esf7";
  console.log(`[Migration] Connecting to '${targetDbName}'...`);

  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: targetDbName,
    ssl: sslConfig,
  });

  await client.connect();

  try {
    console.log(
      "[Migration] Adding 'key_stage' column to 'esf7_personnel_designations' if not exists...",
    );

    await client.query(`
      ALTER TABLE esf7_personnel_designations 
      ADD COLUMN IF NOT EXISTS key_stage VARCHAR(20);

      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_designations_key_stage 
      ON esf7_personnel_designations (key_stage);
    `);

    console.log(
      "[Migration] Column 'key_stage' and index verified successfully.",
    );

    // Backfill existing records
    console.log(
      "[Migration] Backfilling 'key_stage' values for existing records...",
    );

    const rowsRes = await client.query(
      `SELECT id, designation_name, serialized_key, raw_payload FROM esf7_personnel_designations`,
    );
    console.log(
      `[Migration] Found ${rowsRes.rows.length} existing designation records to inspect.`,
    );

    let updatedCount = 0;
    for (const row of rowsRes.rows) {
      const fullKey = (
        row.serialized_key ||
        row.designation_name ||
        ""
      ).toUpperCase();
      let ks = null;

      if (
        fullKey.startsWith("DEPARTMENT HEAD") &&
        (fullKey.includes("KEY STAGE 1") ||
          fullKey.includes("KS1") ||
          fullKey.includes("KINDER") ||
          fullKey.includes("GRADE 1") ||
          fullKey.includes("GRADE 2") ||
          fullKey.includes("GRADE 3")) &&
        !fullKey.includes("KEY STAGE 2") &&
        !fullKey.includes("KEY STAGE 3") &&
        !fullKey.includes("KEY STAGE 4") &&
        !fullKey.includes("GRADE 4") &&
        !fullKey.includes("GRADE 5") &&
        !fullKey.includes("GRADE 6") &&
        !fullKey.includes("GRADE 7") &&
        !fullKey.includes("GRADE 8") &&
        !fullKey.includes("GRADE 9") &&
        !fullKey.includes("GRADE 10")
      ) {
        ks = "KS1";
      } else if (fullKey.includes("KEY STAGE 2") || fullKey.includes("KS2")) {
        ks = "KS2";
      } else if (fullKey.includes("KEY STAGE 3") || fullKey.includes("KS3")) {
        ks = "KS3";
      } else if (
        fullKey.includes("KEY STAGE 4") ||
        fullKey.includes("KS4") ||
        fullKey.includes("ACADEMIC TRACK") ||
        fullKey.includes("TECH-PRO TRACK")
      ) {
        ks = "KS4";
      }

      if (ks) {
        await client.query(
          `UPDATE esf7_personnel_designations SET key_stage = $1, updated_at = NOW() WHERE id = $2`,
          [ks, row.id],
        );
        updatedCount++;
      }
    }

    console.log(
      `[Migration] Successfully backfilled ${updatedCount} records with key_stage values.`,
    );

    const checkRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'esf7_personnel_designations'
      ORDER BY ordinal_position;
    `);

    console.log("\n--- Verified esf7_personnel_designations Columns ---");
    checkRes.rows.forEach((r) =>
      console.log(`• ${r.column_name} (${r.data_type})`),
    );
    console.log("-----------------------------------------------------\n");
  } finally {
    await client.end();
  }
}

migrateAddKeyStage().catch((err) => {
  console.error("[Migration Error]:", err);
  process.exit(1);
});
