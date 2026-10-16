const { Pool } = require("pg");

const prodUrl =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require";
const stagingUrl =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7_staging?sslmode=require";

const prodPool = new Pool({
  connectionString: prodUrl,
  ssl: { rejectUnauthorized: false },
});
const stagingPool = new Pool({
  connectionString: stagingUrl,
  ssl: { rejectUnauthorized: false },
});

async function inspect() {
  try {
    for (const schoolId of ["300488", "342285"]) {
      console.log(
        `\n=================== ROW COUNTS FOR SCHOOL ${schoolId} ===================`,
      );

      const tablesWithSchoolId = [
        "esf7_personnel_profile",
        "esf7_personnel_designations",
        "esf7_admin_task",
        "esf7_related_task",
        "esf7_workload_rows",
        "esf7_regular_sections",
        "esf7_als_sections",
        "esf7_aral_sections",
        "esf7_sned_sections",
        "esf7_remedial_enrichment_sections",
      ];

      const tablesWithPersonnelId = [
        "esf7_personnel_employment",
        "esf7_perssonel_educ",
        "esf7_personnel_ld_trainings",
        "esf7_personnel_learning_areas",
      ];

      for (const tbl of tablesWithSchoolId) {
        const pRes = await prodPool
          .query(`SELECT COUNT(*) FROM ${tbl} WHERE school_id = $1`, [schoolId])
          .catch((e) => ({ rows: [{ count: e.message }] }));
        const sRes = await stagingPool
          .query(`SELECT COUNT(*) FROM ${tbl} WHERE school_id = $1`, [schoolId])
          .catch((e) => ({ rows: [{ count: e.message }] }));
        console.log(
          `${tbl.padEnd(35)} | PROD: ${String(pRes.rows[0].count).padStart(6)} | STAGING: ${String(sRes.rows[0].count).padStart(6)}`,
        );
      }

      for (const tbl of tablesWithPersonnelId) {
        const pRes = await prodPool
          .query(
            `SELECT COUNT(*) FROM ${tbl} c JOIN esf7_personnel_profile p ON c.personnel_id = p.id WHERE p.school_id = $1`,
            [schoolId],
          )
          .catch((e) => ({ rows: [{ count: e.message }] }));
        const sRes = await stagingPool
          .query(
            `SELECT COUNT(*) FROM ${tbl} c JOIN esf7_personnel_profile p ON c.personnel_id = p.id WHERE p.school_id = $1`,
            [schoolId],
          )
          .catch((e) => ({ rows: [{ count: e.message }] }));
        console.log(
          `${tbl.padEnd(35)} | PROD: ${String(pRes.rows[0].count).padStart(6)} | STAGING: ${String(sRes.rows[0].count).padStart(6)}`,
        );
      }
    }
  } finally {
    await prodPool.end();
    await stagingPool.end();
  }
}

inspect();
