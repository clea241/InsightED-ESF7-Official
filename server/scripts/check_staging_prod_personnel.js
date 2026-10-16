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

async function check() {
  try {
    for (const schoolId of ["300488", "342285"]) {
      console.log(
        `\n=================== SCHOOL ${schoolId} ===================`,
      );

      const prodPers = await prodPool.query(
        "SELECT id, prn, legacy_id, first_name, last_name FROM esf7_personnel_profile WHERE school_id = $1 ORDER BY id ASC",
        [schoolId],
      );
      console.log(`PROD Personnel count: ${prodPers.rowCount}`);
      if (prodPers.rowCount > 0) {
        console.log(`PROD Sample first 3:`, prodPers.rows.slice(0, 3));
        console.log(`PROD Sample last 3:`, prodPers.rows.slice(-3));
      }

      const stagingPers = await stagingPool.query(
        "SELECT id, prn, legacy_id, first_name, last_name FROM esf7_personnel_profile WHERE school_id = $1 ORDER BY id ASC",
        [schoolId],
      );
      console.log(`STAGING Personnel count: ${stagingPers.rowCount}`);
      if (stagingPers.rowCount > 0) {
        console.log(`STAGING Sample first 5:`, stagingPers.rows.slice(0, 5));
        console.log(`STAGING Sample last 5:`, stagingPers.rows.slice(-5));

        // Check for non-standard IDs (UUIDs, 843xxx, etc.)
        const nonStdId = stagingPers.rows.filter(
          (r) => !/^\d{6}$/.test(String(r.id)),
        );
        console.log(
          `STAGING Non-standard IDs count: ${nonStdId.length}`,
          nonStdId
            .map((r) => ({
              id: r.id,
              prn: r.prn,
              name: `${r.first_name} ${r.last_name}`,
            }))
            .slice(0, 10),
        );

        // Check for non-standard PRNs (raw numbers, PRN-300488-*, etc.)
        const nonStdPrn = stagingPers.rows.filter(
          (r) => !/^PRN-\d{6,7}$/.test(String(r.prn)),
        );
        console.log(
          `STAGING Non-standard PRNs count: ${nonStdPrn.length}`,
          nonStdPrn
            .map((r) => ({
              id: r.id,
              prn: r.prn,
              name: `${r.first_name} ${r.last_name}`,
            }))
            .slice(0, 10),
        );
      }

      // Check regular sections adviser_id
      const stagingSec = await stagingPool.query(
        "SELECT id, grade_level, section_name, adviser_id, extras->>'advisorId' as extra_adviser FROM esf7_regular_sections WHERE school_id = $1 ORDER BY id ASC",
        [schoolId],
      );
      console.log(`STAGING Regular sections count: ${stagingSec.rowCount}`);
      const unlinkedAdvisers = stagingSec.rows.filter((s) => {
        if (!s.adviser_id && !s.extra_adviser) return false;
        const target = String(s.adviser_id || s.extra_adviser).trim();
        const found = stagingPers.rows.some(
          (p) =>
            String(p.id).trim() === target ||
            String(p.legacy_id || "").trim() === target ||
            String(p.prn || "").trim() === target,
        );
        return !found;
      });
      console.log(
        `STAGING Sections with adviser not found in roster: ${unlinkedAdvisers.length}`,
      );
      if (unlinkedAdvisers.length > 0) {
        console.log(`Sample unlinked:`, unlinkedAdvisers.slice(0, 5));
      }
    }
  } catch (err) {
    console.error("Check failed:", err);
  } finally {
    await prodPool.end();
    await stagingPool.end();
  }
}

check();
