const { Client } = require("pg");

const DB_CONFIG = {
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  ssl: { rejectUnauthorized: false }
};

async function checkMissingTables() {
  const source = new Client({ ...DB_CONFIG, database: "insighted_esf7" });
  const target = new Client({ ...DB_CONFIG, database: "insighted_esf7_staging" });
  await source.connect();
  await target.connect();

  const sRes = await source.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
  const tRes = await target.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");

  const sTables = sRes.rows.map(r => r.table_name);
  const tTables = new Set(tRes.rows.map(r => r.table_name));

  const missingInTarget = sTables.filter(t => !tTables.has(t) && !t.includes('_backup_'));
  console.log("Tables in source missing in staging:", missingInTarget);

  await source.end();
  await target.end();
}

checkMissingTables();
