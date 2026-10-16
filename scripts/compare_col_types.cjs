const { Client } = require("pg");

const DB_CONFIG = {
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  ssl: { rejectUnauthorized: false }
};

async function chk() {
  const clientS = new Client({ ...DB_CONFIG, database: "insighted_esf7" });
  const clientT = new Client({ ...DB_CONFIG, database: "insighted_esf7_staging" });
  await clientS.connect();
  await clientT.connect();

  const tables = [
    'esf7_school_profile', 'schools_iern', 'esf7_school_node_status', 'esf7_passcode_lockout',
    'esf7_regular_sections', 'esf7_aral_sections', 'esf7_personnel_profile', 'esf7_personnel_employment',
    'esf7_perssonel_educ', 'esf7_personnel_ld_trainings', 'esf7_personnel_learning_areas',
    'esf7_personnel_allowances', 'esf7_personnel_designations', 'esf7_personnel_node_status',
    'esf7_personnel_submission_archive', 'esf7_clustered_ghost_sync', 'esf7_workload_rows', 'esf7_correction_items'
  ];

  for (const table of tables) {
    const sCols = await clientS.query('SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name=$1', [table]);
    const tCols = await clientT.query('SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name=$1', [table]);
    const tMap = new Map(tCols.rows.map(r => [r.column_name, r]));
    for (const s of sCols.rows) {
      const t = tMap.get(s.column_name);
      if (t && t.data_type !== s.data_type) {
        console.log(`[${table}] ${s.column_name} -> Source: ${s.data_type} vs Target: ${t.data_type}`);
      }
    }
  }

  await clientS.end();
  await clientT.end();
}

chk();
