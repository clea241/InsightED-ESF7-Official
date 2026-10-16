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

async function testAllTables() {
  const source = new Client({ ...DB_CONFIG, database: "insighted_esf7" });
  await source.connect();

  const pRes = await source.query(
    `SELECT id::text FROM esf7_personnel_profile WHERE school_id = ANY($1::text[])`,
    [SCHOOL_IDS]
  );
  const personnelIds = pRes.rows.map(r => r.id);
  console.log("Personnel IDs count:", personnelIds.length);

  const tablesRes = await source.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '%_backup_%'
    ORDER BY table_name;
  `);

  for (const row of tablesRes.rows) {
    const table = row.table_name;
    if (EXCLUDED_TABLES.includes(table)) continue;

    const colRes = await source.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
    `, [table]);
    const cols = colRes.rows.map(c => c.column_name);

    let whereClause = "";
    let params = [];

    if (cols.includes("school_id")) {
      whereClause = `school_id = ANY($1::text[])`;
      params = [SCHOOL_IDS];
    } else if (cols.includes("personnel_id")) {
      whereClause = `personnel_id::text = ANY($1::text[])`;
      params = [personnelIds];
    } else if (table === "clustered_personnel" && cols.includes("source_school_id")) {
      whereClause = `source_school_id = ANY($1::text[]) OR target_school_id = ANY($1::text[])`;
      params = [SCHOOL_IDS];
    } else {
      console.log(`[NO MATCH] ${table} -> cols: ${cols.join(', ')}`);
      continue;
    }

    const countRes = await source.query(`SELECT count(*)::int as c FROM "${table}" WHERE ${whereClause}`, params);
    const count = countRes.rows[0].c;
    console.log(`[FOUND] ${table.padEnd(35)} -> ${count} rows`);
  }

  await source.end();
}

testAllTables();
