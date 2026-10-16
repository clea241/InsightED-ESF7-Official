const { Client } = require("pg");

const TABLES_WITH_DATA = [
  "esf7_school_profile",
  "schools_iern",
  "esf7_school_node_status",
  "esf7_passcode_lockout",
  "esf7_regular_sections",
  "esf7_aral_sections",
  "esf7_personnel_profile",
  "esf7_personnel_employment",
  "esf7_perssonel_educ",
  "esf7_personnel_ld_trainings",
  "esf7_personnel_learning_areas",
  "esf7_personnel_allowances",
  "esf7_personnel_designations",
  "esf7_personnel_node_status",
  "esf7_personnel_submission_archive",
  "esf7_clustered_ghost_sync",
  "esf7_workload_rows",
  "esf7_correction_items"
];

const DB_CONFIG = {
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  ssl: { rejectUnauthorized: false }
};

async function checkCols() {
  const source = new Client({ ...DB_CONFIG, database: "insighted_esf7" });
  const target = new Client({ ...DB_CONFIG, database: "insighted_esf7_staging" });
  await source.connect();
  await target.connect();

  for (const table of TABLES_WITH_DATA) {
    const sCols = await source.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]);
    const tCols = await target.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]);
    const tSet = new Set(tCols.rows.map(c => c.column_name));
    const missing = sCols.rows.filter(c => !tSet.has(c.column_name));
    if (missing.length > 0) {
      console.log(`Table ${table} has missing columns in staging:`, missing.map(m => m.column_name));
    } else {
      console.log(`Table ${table}: all ${sCols.rows.length} columns match!`);
    }
  }

  await source.end();
  await target.end();
}

checkCols();
