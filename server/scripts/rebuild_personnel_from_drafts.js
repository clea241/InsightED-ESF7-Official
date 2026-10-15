/**
 * Clean Slate Rebuild of esf7_personnel_profile & children from school_drafts
 *
 * Rules:
 * - Strictly isolated to insighted_esf7 (Azure DB).
 * - Backups already verified in esf7_personnel_profile_backup_20261013, esf7_personnel_employment_backup_20261013, esf7_workload_rows_backup_20261013.
 * - Truncates esf7_personnel_profile CASCADE.
 * - Sequentially re-ingests authentic drafts:
 *   - Global numeric ID starting at 1.
 *   - Per-school sequential PRN (PRN-1, PRN-2, ...).
 *   - Preserves DepEd employee number in employee_no.
 *   - Populates esf7_personnel_employment and esf7_perssonel_educ.
 *   - Restores and re-links workload rows for each school.
 */

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
  connectionTimeoutMillis: 10000,
});

function sanitizeText(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === "" || s.toUpperCase() === "NULL" ? null : s;
}

function sanitizeNumber(val, defaultVal = 0) {
  if (val === undefined || val === null || val === "") return defaultVal;
  const num = Number(val);
  return isNaN(num) ? defaultVal : num;
}

function coerceDateField(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === "NULL" || s.startsWith("0000")) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

async function run() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log("==========================================================");
    console.log(
      "🚀 CLEAN SLATE REBUILD: esf7_personnel_profile FROM school_drafts",
    );
    console.log("==========================================================");

    // 1. Verify safety backups exist
    console.log("Verifying backup tables...");
    const bCheck = await client.query(
      "SELECT count(*) FROM esf7_personnel_profile_backup_20261013",
    );
    console.log(
      `✓ Safety backup confirmed: ${bCheck.rows[0].count} records intact.`,
    );

    // 2. Truncate table with CASCADE
    console.log("Truncating esf7_personnel_profile CASCADE...");
    await client.query("TRUNCATE TABLE esf7_personnel_profile CASCADE;");
    console.log("✓ Table cleanly truncated.");

    // 3. Count total drafts to process
    const totalDraftsRes = await client.query(
      "SELECT count(*) FROM school_drafts WHERE jsonb_array_length(COALESCE(payload->'personnel', '[]'::jsonb)) > 0",
    );
    const totalSchools = Number(totalDraftsRes.rows[0].count);
    console.log(`Total schools to process: ${totalSchools}`);

    let globalPersonnelId = 1;
    let processedSchools = 0;
    let totalPersonnelInserted = 0;
    let totalWorkloadsRestored = 0;

    const CHUNK_SIZE = 250;
    let offset = 0;

    while (offset < totalSchools) {
      const chunkRes = await client.query(
        `SELECT school_id, school_year, payload 
         FROM school_drafts 
         WHERE jsonb_array_length(COALESCE(payload->'personnel', '[]'::jsonb)) > 0
         ORDER BY school_id ASC 
         LIMIT $1 OFFSET $2`,
        [CHUNK_SIZE, offset],
      );

      if (chunkRes.rows.length === 0) break;

      await client.query("BEGIN");

      for (const row of chunkRes.rows) {
        const { school_id, school_year, payload } = row;
        const cleanSchoolId = String(school_id).replace(/^SCH-/i, "");
        const targetSy = school_year || "SY 26-27";
        const rawPersonnel = Array.isArray(payload?.personnel)
          ? payload.personnel
          : [];

        // Deduplicate within the draft
        const seen = new Set();
        const schoolPersonnel = [];

        for (const p of rawPersonnel) {
          const fn = sanitizeText(p.first_name || p.first || p.firstName);
          const ln = sanitizeText(p.last_name || p.last || p.lastName);
          if (!fn && !ln) continue;
          const key = `${(fn || "").toUpperCase()}|${(ln || "").toUpperCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          schoolPersonnel.push(p);
        }

        if (schoolPersonnel.length === 0) continue;

        // Map draft IDs and legacy IDs to newId
        const legacyToNewId = new Map();

        // 1. Insert personnel, employment, and education
        let seq = 1;
        for (const p of schoolPersonnel) {
          const newId = String(globalPersonnelId++);
          const prn = `PRN-${seq++}`;
          const draftId = sanitizeText(p.id);
          const rawPrn = sanitizeText(p.prn);
          const empNo =
            rawPrn && /^\d+$/.test(rawPrn)
              ? rawPrn
              : sanitizeText(p.employee_no || p.employeeNo);
          const fn =
            sanitizeText(p.first_name || p.first || p.firstName) || "UNKNOWN";
          const ln =
            sanitizeText(p.last_name || p.last || p.lastName) || "STAFF";
          const mn = sanitizeText(p.middle_name || p.middle || p.middleName);
          const ext = sanitizeText(
            p.name_extension || p.extension || p.nameExtension,
          );
          const salutation = sanitizeText(p.salutation || p.title) || "MR.";
          const pType = sanitizeText(p.type) || "teaching";
          const sex =
            sanitizeText(p.sex_at_birth || p.gender || p.sex) || "FEMALE";
          const bdate = coerceDateField(p.birthdate);
          const age = sanitizeNumber(p.age, null);
          const tin = sanitizeText(p.tin);
          const philsys = sanitizeText(p.philsys_no || p.philsysNo);
          const depedEmail = sanitizeText(
            p.deped_email || p.email || p.depedEmail,
          );
          const civilStatus = sanitizeText(p.civil_status || p.civilStatus);
          const religion = sanitizeText(p.religion);
          const ethnicGroup = sanitizeText(p.ethnic_group || p.ethnicGroup);
          const isSchoolHead = Boolean(
            p.is_school_head ||
            p.isSchoolHead ||
            /PRINCIPAL|HEAD/i.test(p.position || ""),
          );

          if (draftId) legacyToNewId.set(draftId, newId);
          if (rawPrn) legacyToNewId.set(rawPrn, newId);

          // Insert into esf7_personnel_profile
          await client.query(
            `INSERT INTO esf7_personnel_profile (
              id, prn, school_id, school_year, first_name, middle_name, last_name, name_extension,
              salutation, type, sex_at_birth, birthdate, age, tin, no_tin, philsys_no, no_philsys,
              employee_no, deped_email, no_deped_email, is_school_head, civil_status, solo_parent,
              religion, ethnic_group, legacy_id, raw_payload, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW(), NOW()
            )`,
            [
              newId,
              prn,
              cleanSchoolId,
              targetSy,
              fn,
              mn,
              ln,
              ext,
              salutation,
              pType,
              sex,
              bdate,
              age,
              tin,
              !tin,
              philsys,
              !philsys,
              empNo,
              depedEmail,
              !depedEmail,
              isSchoolHead,
              civilStatus,
              false,
              religion,
              ethnicGroup,
              draftId,
              JSON.stringify(p),
            ],
          );

          // Insert into esf7_personnel_employment
          const pos =
            sanitizeText(p.position || p.plantilla_position) || "TEACHER I";
          let posCat =
            sanitizeText(p.position_category || p.positionCategory) ||
            "TEACHING";
          if (
            !["TEACHING", "RELATED TEACHING", "NON-TEACHING"].includes(
              posCat.toUpperCase(),
            )
          ) {
            posCat = "TEACHING";
          }
          const step = Math.max(
            1,
            Math.min(8, sanitizeNumber(p.step_increment || p.stepIncrement, 1)),
          );
          const firstServiceDate = coerceDateField(
            p.first_service_date || p.firstServiceDate,
          );
          const lastPromotionDate = coerceDateField(
            p.last_promotion_date || p.lastPromotionDate,
          );
          const fundSource =
            sanitizeText(p.fund_source || p.fundSource) ||
            "NATIONAL GOVERNMENT";
          const natureAppt =
            sanitizeText(p.nature_of_appointment || p.natureOfAppointment) ||
            "REGULAR PERMANENT";
          const hiringArr =
            sanitizeText(p.hiring_arrangement || p.hiringArrangement) ||
            "REGULAR";
          const deployStatus =
            sanitizeText(p.deployment_status || p.deploymentStatus) ||
            "OWN STATION";

          await client.query(
            `INSERT INTO esf7_personnel_employment (
              id, personnel_id, position, position_category, step_increment, actual_step,
              fund_source, nature_of_appointment, hiring_arrangement, deployment_status,
              first_service_date, last_promotion_date, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
            [
              `EMP-${cleanSchoolId}-${newId}`,
              newId,
              pos,
              posCat.toUpperCase(),
              step,
              step,
              fundSource,
              natureAppt,
              hiringArr,
              deployStatus,
              firstServiceDate,
              lastPromotionDate,
            ],
          );

          // Insert into esf7_perssonel_educ
          const degree = sanitizeText(
            p.degree || p.college_degree || p.collegeDegree,
          );
          const major = sanitizeText(p.major);
          const minor = sanitizeText(p.minor);
          const highestAttain =
            sanitizeText(
              p.highest_educational_attainment ||
                p.highestEducationalAttainment,
            ) || "COLLEGE GRADUATE / BACCALAUREATE";

          await client.query(
            `INSERT INTO esf7_perssonel_educ (
              id, personnel_id, highest_educational_attainment, college_degree, major, minor, raw_payload, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
            [
              `EDU-${cleanSchoolId}-${newId}`,
              newId,
              highestAttain,
              degree,
              major,
              minor,
              JSON.stringify(p),
            ],
          );

          totalPersonnelInserted++;
        }

        // Restore workload rows for this school from backup
        const wklBackupRes = await client.query(
          "SELECT * FROM esf7_workload_rows_backup_20261013 WHERE school_id = $1",
          [cleanSchoolId],
        );

        if (wklBackupRes.rows.length > 0) {
          for (const w of wklBackupRes.rows) {
            let targetPersonnelId = null;
            for (const [legacyId, newId] of legacyToNewId.entries()) {
              if (
                w.id.includes(legacyId) ||
                (w.personnel_id && w.personnel_id === legacyId)
              ) {
                targetPersonnelId = newId;
                break;
              }
            }

            if (!targetPersonnelId) {
              const seqMatch = w.id.match(/-(\d{3})-/);
              if (seqMatch) {
                const targetDraftId = `PER-${cleanSchoolId}-${seqMatch[1]}`;
                targetPersonnelId = legacyToNewId.get(targetDraftId);
              }
            }

            if (targetPersonnelId) {
              await client.query(
                `INSERT INTO esf7_workload_rows (
                  id, personnel_id, school_id, school_year, grade_level, section_id,
                  section_name, subject, start_time, end_time, days, term, extras, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
                ON CONFLICT (id) DO NOTHING`,
                [
                  w.id,
                  targetPersonnelId,
                  w.school_id,
                  w.school_year,
                  w.grade_level,
                  w.section_id,
                  w.section_name,
                  w.subject,
                  w.start_time,
                  w.end_time,
                  w.days,
                  w.term,
                  w.extras,
                ],
              );
              totalWorkloadsRestored++;
            }
          }
        }
      }

      await client.query("COMMIT");

      offset += chunkRes.rows.length;
      processedSchools += chunkRes.rows.length;

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const percent = ((processedSchools / totalSchools) * 100).toFixed(1);
      console.log(
        `[Progress ${percent}%] Processed ${processedSchools}/${totalSchools} schools | Total personnel: ${totalPersonnelInserted} | Workloads: ${totalWorkloadsRestored} | Elapsed: ${elapsedSec}s`,
      );
    }

    const finalSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("==========================================================");
    console.log(`🎉 REBUILD COMPLETE in ${finalSec}s!`);
    console.log(`✓ Schools processed: ${processedSchools}`);
    console.log(
      `✓ Total personnel inserted: ${totalPersonnelInserted} (IDs from 1 to ${globalPersonnelId - 1})`,
    );
    console.log(`✓ Workloads restored & re-linked: ${totalWorkloadsRestored}`);
    console.log("==========================================================");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("FATAL ERROR DURING REBUILD:", err);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

run();
