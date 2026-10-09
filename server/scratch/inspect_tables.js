const db = require('../db');
const fs = require('fs');
const path = require('path');

const TARGET_TABLES = [
  'school_drafts',
  'esf7_school_profile',
  'esf7_regular_sections',
  'esf7_sned_sections',
  'esf7_als_sections',
  'esf7_aral_sections',
  'esf7_remedial_enrichment_sections',
  'esf7_personnel_profile',
  'esf7_personnel_employment',
  'esf7_perssonel_educ',
  'esf7_personnel_learning_areas',
  'esf7_personnel_designations',
  'esf7_personnel_ld_trainings',
  'esf7_workload_rows',
  'esf7_shs_workload_rows',
  'esf7_admin_task',
  'esf7_related_task',
  'overload_absences',
  'esf7_workload_transfer',
  'esf7_school_node_status',
  'esf7_personnel_node_status'
];

async function run() {
  try {
    const tableMetadata = {};

    for (const t of TARGET_TABLES) {
      // 1. Columns
      const colRes = await db.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [t]);

      // 2. Constraints & Keys
      const conRes = await db.query(`
        SELECT 
          tc.constraint_name, 
          tc.constraint_type,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.table_name = $1
        ORDER BY tc.constraint_type, kcu.ordinal_position;
      `, [t]);

      // 3. Row count
      const countRes = await db.query(`SELECT COUNT(*) as cnt FROM ${t};`);

      tableMetadata[t] = {
        rowCount: parseInt(countRes.rows[0].cnt, 10),
        columns: colRes.rows,
        constraints: conRes.rows
      };
    }

    fs.writeFileSync(path.join(__dirname, 'normalized_tables_meta.json'), JSON.stringify(tableMetadata, null, 2));
    console.log('Successfully written normalized_tables_meta.json');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
