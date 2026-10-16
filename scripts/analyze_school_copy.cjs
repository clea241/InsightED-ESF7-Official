const { Client } = require("pg");

const SCHOOL_IDS = [
  "300478",
  "107891",
  "305335",
  "305419",
  "500564",
  "300605",
  "306356",
  "305420"
];

const EXCLUDED_TABLES = [
  "school_drafts",
  "school_draft",
  "room_cache",
  "esf7_room_roster_cache",
  "deleted_personnel",
  "esf7_deleted_personnel",
  "esf7_database",
  "esf7_database_2.0",
  "esf7_database_dummy",
  "salary_matrix"
];

const DB_CONFIG = {
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  ssl: { rejectUnauthorized: false }
};

async function run() {
  const sourceClient = new Client({ ...DB_CONFIG, database: "insighted_esf7" });
  await sourceClient.connect();

  try {
    const tablesRes = await sourceClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '%_backup_%'
      ORDER BY table_name;
    `);
    const allTables = tablesRes.rows.map(r => r.table_name);

    const tableSchemas = {};
    for (const table of allTables) {
      const colRes = await sourceClient.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      tableSchemas[table] = colRes.rows;
    }

    // Identify personnel for target schools
    const pRes = await sourceClient.query(`
      SELECT id, school_id 
      FROM esf7_personnel_profile 
      WHERE school_id = ANY($1::text[])
    `, [SCHOOL_IDS]);
    const personnelIds = pRes.rows.map(r => r.id);
    console.log(`Target Schools: ${SCHOOL_IDS.join(', ')}`);
    console.log(`Total Personnel in esf7_personnel_profile: ${personnelIds.length}`);

    console.log("\n=================== SOURCE RECORD COUNTS ===================");
    const plan = [];

    for (const table of allTables) {
      if (EXCLUDED_TABLES.includes(table)) {
        console.log(`[EXCLUDED] ${table}`);
        continue;
      }

      const cols = tableSchemas[table].map(c => c.column_name);
      let whereClause = "";
      let params = [];

      if (cols.includes("school_id")) {
        whereClause = `school_id = ANY($1::text[])`;
        params = [SCHOOL_IDS];
      } else if (cols.includes("personnel_id") && personnelIds.length > 0) {
        whereClause = `personnel_id = ANY($1)`;
        params = [personnelIds];
      } else {
        console.log(`[SKIPPED - NO SCHOOL/PERSONNEL LINK] ${table} (Cols: ${cols.slice(0, 4).join(', ')})`);
        continue;
      }

      const countRes = await sourceClient.query(
        `SELECT count(*)::int as cnt FROM "${table}" WHERE ${whereClause}`,
        params
      );
      const rowCount = countRes.rows[0].cnt;
      console.log(`[COPY CANDIDATE] ${table.padEnd(35)} : ${rowCount} rows`);
      plan.push({ table, whereClause, params, rowCount, cols });
    }

    console.log("\nTotal tables to copy:", plan.filter(p => p.rowCount > 0).length, "with non-zero rows.");
  } finally {
    await sourceClient.end();
  }
}

run().catch(err => {
  console.error("Error during run:", err);
  process.exit(1);
});
