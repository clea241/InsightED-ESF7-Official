require("../loadEnv");
require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Pool } = require("pg");

const PROD_URL =
  process.env.PROD_DATABASE_URL || process.env.INSIGHTED_DATABASE_URL || "";
const STAGING_URL =
  process.env.STAGING_DATABASE_URL ||
  process.env.PRIMARY_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "";

const TARGET_SCHOOLS = ["300488", "342285"];

function sanitizeValue(val, colType) {
  if (val === null || val === undefined) return null;
  if (colType === "jsonb" || colType === "json") {
    if (typeof val === "object") return JSON.stringify(val);
    return val;
  }
  return val;
}

async function run() {
  console.log(
    "=========================================================================",
  );
  console.log(
    "🚀 Syncing PROD Standardized Personnel & Child Tables -> STAGING",
  );
  console.log("   Target schools: 300488 & 342285");
  console.log(
    "=========================================================================",
  );

  const prod = new Pool({ connectionString: PROD_URL, max: 2 });
  const staging = new Pool({ connectionString: STAGING_URL, max: 2 });

  try {
    for (const sch of TARGET_SCHOOLS) {
      const sPair = [sch, `SCH-${sch}`];
      console.log(`\n--- Processing School ${sch} ---`);

      // 1. Get old staging personnel IDs
      const stagingOldP = await staging.query(
        `SELECT id FROM esf7_personnel_profile WHERE school_id = ANY($1)`,
        [sPair],
      );
      const oldIds = stagingOldP.rows.map((r) => r.id);
      console.log(
        `Found ${oldIds.length} personnel currently in STAGING for ${sch}.`,
      );

      // 2. Fetch standardized personnel from PROD
      const pColsRes = await prod.query(`
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_name = 'esf7_personnel_profile' ORDER BY ordinal_position
      `);
      const pCols = pColsRes.rows.map((r) => r.column_name);
      const pColTypes = Object.fromEntries(
        pColsRes.rows.map((r) => [r.column_name, r.data_type]),
      );

      const prodPersonnel = await prod.query(
        `
        SELECT ${pCols.map((c) => `"${c}"`).join(", ")} 
        FROM esf7_personnel_profile 
        WHERE school_id = ANY($1)
        ORDER BY id ASC
      `,
        [sPair],
      );

      console.log(
        `Found ${prodPersonnel.rows.length} standardized personnel in PROD for ${sch}.`,
      );
      const newIds = prodPersonnel.rows.map((r) => r.id);

      // Find rogue IDs that are in staging but NOT in prod
      const rogueIds = oldIds.filter((id) => !newIds.includes(id));
      console.log(
        `Rogue personnel IDs to remove from STAGING (${rogueIds.length}):`,
        rogueIds,
      );

      // Nullify references in sections before deleting rogue IDs
      if (rogueIds.length > 0) {
        await staging.query(
          `UPDATE esf7_regular_sections SET adviser_id = NULL WHERE adviser_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `UPDATE esf7_aral_sections SET tutor_id = NULL WHERE tutor_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `UPDATE esf7_remedial_enrichment_sections SET assigned_teacher_id = NULL WHERE assigned_teacher_id = ANY($1)`,
          [rogueIds],
        );

        // Clean child tables for rogue personnel
        await staging.query(
          `DELETE FROM esf7_workload_rows WHERE personnel_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `DELETE FROM esf7_personnel_learning_areas WHERE personnel_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `DELETE FROM esf7_personnel_ld_trainings WHERE personnel_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `DELETE FROM esf7_perssonel_educ WHERE personnel_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `DELETE FROM esf7_personnel_employment WHERE personnel_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `DELETE FROM esf7_personnel_designations WHERE personnel_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `DELETE FROM esf7_personnel_allowances WHERE personnel_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `DELETE FROM esf7_personnel_node_status WHERE personnel_id = ANY($1)`,
          [rogueIds],
        );
        await staging.query(
          `DELETE FROM esf7_personnel_profile WHERE id = ANY($1)`,
          [rogueIds],
        );
        console.log(
          `✓ Deleted ${rogueIds.length} rogue personnel from STAGING.`,
        );
      }

      // Upsert standardized personnel from PROD
      console.log(
        `Upserting ${prodPersonnel.rows.length} standardized personnel into STAGING...`,
      );
      for (const r of prodPersonnel.rows) {
        const insertCols = pCols.map((c) => `"${c}"`).join(", ");
        const placeholders = pCols.map((_, i) => `$${i + 1}`).join(", ");
        const vals = pCols.map((c) => sanitizeValue(r[c], pColTypes[c]));

        // Update all columns including prn, employee_no, legacy_id, first_name, last_name, etc.
        const updateSets = pCols
          .filter((c) => c !== "id")
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(", ");

        await staging.query(
          `
          INSERT INTO esf7_personnel_profile (${insertCols})
          VALUES (${placeholders})
          ON CONFLICT (id) DO UPDATE SET ${updateSets};
        `,
          vals,
        );
      }
      console.log(
        `✓ Upserted ${prodPersonnel.rows.length} standardized personnel.`,
      );

      // Sync Child Tables for these personnel
      const childTables = [
        "esf7_personnel_employment",
        "esf7_perssonel_educ",
        "esf7_personnel_ld_trainings",
        "esf7_personnel_learning_areas",
        "esf7_personnel_designations",
      ];

      for (const ct of childTables) {
        // Delete staging child rows for target personnel first to have a clean 1:1 match with prod
        await staging.query(`DELETE FROM ${ct} WHERE personnel_id = ANY($1)`, [
          newIds,
        ]);

        const colsRes = await prod.query(
          `
          SELECT column_name, data_type FROM information_schema.columns 
          WHERE table_name = $1 ORDER BY ordinal_position
        `,
          [ct],
        );
        const cols = colsRes.rows.map((r) => r.column_name);
        const colTypes = Object.fromEntries(
          colsRes.rows.map((r) => [r.column_name, r.data_type]),
        );

        const rowsRes = await prod.query(
          `
          SELECT ${cols.map((c) => `"${c}"`).join(", ")} 
          FROM ${ct} 
          WHERE personnel_id = ANY($1)
        `,
          [newIds],
        );

        for (const r of rowsRes.rows) {
          const insertCols = cols.map((c) => `"${c}"`).join(", ");
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
          const vals = cols.map((c) => sanitizeValue(r[c], colTypes[c]));
          await staging.query(
            `
            INSERT INTO ${ct} (${insertCols})
            VALUES (${placeholders})
            ON CONFLICT DO NOTHING;
          `,
            vals,
          );
        }
        console.log(`✓ Copied ${rowsRes.rows.length} rows into staging.${ct}`);
      }

      // Also ensure school_drafts in staging has the updated standardized personnel list
      const draftRes = await staging.query(
        `SELECT payload FROM school_drafts WHERE school_id = $1 LIMIT 1`,
        [sch],
      );
      if (draftRes.rows.length > 0 && draftRes.rows[0].payload) {
        const payload = draftRes.rows[0].payload;
        if (Array.isArray(payload.personnel)) {
          // Replace payload.personnel with the standardized list from prodPersonnel
          payload.personnel = prodPersonnel.rows.map((p) => ({
            id: p.id,
            prn: p.prn,
            employeeNo: p.employee_no || "",
            employee_no: p.employee_no || "",
            legacy_id: p.legacy_id || "",
            firstName: p.first_name || "",
            first_name: p.first_name || "",
            middleName: p.middle_name || "",
            middle_name: p.middle_name || "",
            lastName: p.last_name || "",
            last_name: p.last_name || "",
            type: p.type || "teaching",
            status: p.status || "canonical",
          }));
          await staging.query(
            `UPDATE school_drafts SET payload = $1, updated_at = NOW() WHERE school_id = $2`,
            [JSON.stringify(payload), sch],
          );
          console.log(
            `✓ Synced school_drafts.payload.personnel for school ${sch} to standardized personnel.`,
          );
        }
      }
    }

    console.log("\n=================== VERIFICATION ===================");
    for (const sch of TARGET_SCHOOLS) {
      const res = await staging.query(
        `
        SELECT id, prn, employee_no, legacy_id, first_name, last_name 
        FROM esf7_personnel_profile 
        WHERE school_id IN ($1, $2)
        ORDER BY id ASC
      `,
        [sch, `SCH-${sch}`],
      );
      console.log(
        `\nSchool ${sch} total personnel in staging: ${res.rows.length}`,
      );
      console.log("First 3:");
      console.table(res.rows.slice(0, 3));
      console.log("Last 3:");
      console.table(res.rows.slice(-3));

      // Check if any non-standard prn or id
      const rogue = res.rows.filter((r) => !r.prn.startsWith("PRN-"));
      console.log(`Non-PRN count for ${sch}: ${rogue.length}`);
    }

    console.log("\n🎉 ALL TARGET SCHOOLS STANDARDIZED SUCCESSFULLY!");
  } catch (err) {
    console.error("❌ Sync Error:", err);
  } finally {
    await prod.end();
    await staging.end();
  }
}

run();
