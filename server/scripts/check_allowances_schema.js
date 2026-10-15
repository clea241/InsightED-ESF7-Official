const { Pool } = require("../node_modules/pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== Checking tables matching %allowance% ===");
    const tbls = await client.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%allowance%';
    `);
    console.log(tbls.rows);

    for (const t of tbls.rows) {
      if (t.table_type === "BASE TABLE" || t.table_type === "VIEW") {
        const count = await client.query(
          `SELECT count(*) FROM "${t.table_name}"`,
        );
        console.log(`Count for ${t.table_name}: ${count.rows[0].count}`);

        const cols = await client.query(
          `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position;
        `,
          [t.table_name],
        );
        console.log(`Columns for ${t.table_name}:`, cols.rows);
      }
    }

    const fks = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname LIKE '%allowance%';
    `);
    console.log("Constraints on allowance tables:", fks.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
