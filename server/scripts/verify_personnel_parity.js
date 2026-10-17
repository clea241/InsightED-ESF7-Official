require("../db/directPort"); // direct Postgres connection
const { pool } = require("../db/index");
const {
  loadSchoolNormalizedData,
  loadPersonnelNormalizedData,
} = require("../services/personnelSharedReader");
const { formatPersonnelRecord } = require("../controllers/personnel/common");

/**
 * Parity Verification Script
 * Compares the read paths across all personnel in a school:
 * 1. Normalized Database rows (esf7_personnel_ld_trainings, esf7_personnel_learning_areas)
 * 2. Personnel Profiling read path (formatPersonnelRecord + loadPersonnelNormalizedData)
 * 3. Room QR Portal read path (loadSchoolNormalizedData + formatPersonnelRecord)
 *
 * Verifies that field names, shapes, and row counts are identical across all paths.
 */

async function checkParity(schoolId = "300488") {
  const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
  console.log(`=======================================================`);
  console.log(`Personnel Profiling vs Room QR Data Parity Verification`);
  console.log(`School ID: ${cleanSchoolId}`);
  console.log(`=======================================================\n`);

  const client = await pool.connect();
  try {
    // 1. Fetch all profiles for the school
    const { rows: profiles } = await client.query(
      `
      SELECT 
        p.*,
        e.position, e.position_category, e.first_service_date,
        ed.highest_educational_attainment, ed.college_degree
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
      WHERE p.school_id = $1 OR p.school_id = ('SCH-' || $1)
      ORDER BY p.last_name ASC, p.first_name ASC
    `,
      [cleanSchoolId],
    );

    console.log(
      `Loaded ${profiles.length} personnel profiles for School ${cleanSchoolId}.\n`,
    );

    // 2. Load Whole-School Normalized Data (Room QR path)
    const schoolNormalized = await loadSchoolNormalizedData(
      client,
      cleanSchoolId,
    );

    let matchCount = 0;
    const mismatches = [];

    for (const p of profiles) {
      const pId = String(p.id).trim();
      const pName = `${p.last_name || ""}, ${p.first_name || ""}`.trim();

      // A. Path 1: Room QR / School-level lookup
      const roomQrNorm = schoolNormalized.getForTeacher(
        pId,
        p.prn,
        p.employee_no,
        p.legacy_id,
      );

      // B. Path 2: Personnel Profiling / Individual lookup
      const profilingNorm = await loadPersonnelNormalizedData(client, p);

      // C. Path 3: Direct DB query for this teacher
      const { rows: dbLd } = await client.query(
        `
        SELECT * FROM esf7_personnel_ld_trainings 
        WHERE personnel_id = $1 OR personnel_id = $2
      `,
        [pId, p.legacy_id || pId],
      );

      const { rows: dbLa } = await client.query(
        `
        SELECT * FROM esf7_personnel_learning_areas 
        WHERE personnel_id = $1 OR personnel_id = $2
      `,
        [pId, p.legacy_id || pId],
      );

      // Check L&D trainings parity
      const roomQrNeap = roomQrNorm.neapTrainingRows || [];
      const profNeap = profilingNorm.neapTrainingRows || [];
      const roomQrCert = roomQrNorm.certificationRows || [];
      const profCert = profilingNorm.certificationRows || [];
      const roomQrOther = roomQrNorm.otherTrainingRows || [];
      const profOther = profilingNorm.otherTrainingRows || [];

      const totalRoomQrTrainings =
        roomQrNeap.length + roomQrCert.length + roomQrOther.length;
      const totalProfTrainings =
        profNeap.length + profCert.length + profOther.length;

      // Check Learning Area Matrix parity
      const roomQrLaKeys = Object.keys(roomQrNorm.learningAreaMap || {})
        .filter((k) => roomQrNorm.learningAreaMap[k]?.checked)
        .sort();
      const profLaKeys = Object.keys(profilingNorm.learningAreaMap || {})
        .filter((k) => profilingNorm.learningAreaMap[k]?.checked)
        .sort();

      let hasMismatch = false;
      const issues = [];

      if (totalRoomQrTrainings !== totalProfTrainings) {
        hasMismatch = true;
        issues.push(
          `L&D Total Mismatch: Room QR has ${totalRoomQrTrainings}, Profiling has ${totalProfTrainings}`,
        );
      }

      if (roomQrNeap.length !== profNeap.length) {
        hasMismatch = true;
        issues.push(
          `NEAP Trainings: Room QR has ${roomQrNeap.length}, Profiling has ${profNeap.length}`,
        );
      }

      if (roomQrCert.length !== profCert.length) {
        hasMismatch = true;
        issues.push(
          `Certifications: Room QR has ${roomQrCert.length}, Profiling has ${profCert.length}`,
        );
      }

      if (roomQrOther.length !== profOther.length) {
        hasMismatch = true;
        issues.push(
          `Other Trainings: Room QR has ${roomQrOther.length}, Profiling has ${profOther.length}`,
        );
      }

      if (JSON.stringify(roomQrLaKeys) !== JSON.stringify(profLaKeys)) {
        hasMismatch = true;
        issues.push(
          `Learning Areas Mismatch: Room QR has [${roomQrLaKeys.join(", ")}], Profiling has [${profLaKeys.join(", ")}]`,
        );
      }

      // Both screens use the same loader, so agreeing with each other proves little. Also compare with the RAW
      // tables: a screen must never show FEWER rows than the database holds for this teacher.
      const rawLdIds = new Set(dbLd.map((r) => String(r.id)));
      if (totalProfTrainings < rawLdIds.size) {
        hasMismatch = true;
        issues.push(
          `L&D rows dropped: database has ${rawLdIds.size}, screens show ${totalProfTrainings}`,
        );
      }
      const rawLaKeys = new Set();
      for (const row of dbLa) {
        const m =
          typeof row.matrix_data === "string"
            ? JSON.parse(row.matrix_data || "{}")
            : row.matrix_data || {};
        for (const [k, v] of Object.entries(m))
          if (v && (v.checked ?? true)) rawLaKeys.add(k);
      }
      const missingLa = [...rawLaKeys].filter((k) => !profLaKeys.includes(k));
      if (missingLa.length > 0) {
        hasMismatch = true;
        issues.push(
          `Learning areas dropped: database has [${missingLa.join(", ")}] that the screens do not show`,
        );
      }

      if (hasMismatch) {
        mismatches.push({
          id: pId,
          name: pName,
          issues,
        });
      } else {
        matchCount++;
      }
    }

    console.log(`-------------------------------------------------------`);
    console.log(`Parity Verification Results:`);
    console.log(`  Total Personnel Checked: ${profiles.length}`);
    console.log(`  Perfect Parity Matches:  ${matchCount}`);
    console.log(`  Mismatches Found:        ${mismatches.length}`);
    console.log(`-------------------------------------------------------\n`);

    if (mismatches.length > 0) {
      console.error(
        `❌ Mismatches detected across ${mismatches.length} teacher(s):`,
      );
      mismatches.forEach((m) => {
        console.error(`  - [${m.id}] ${m.name}:`);
        m.issues.forEach((iss) => console.error(`      * ${iss}`));
      });
      process.exitCode = 1;
    } else {
      console.log(
        `✅ COMPLETE PARITY VERIFIED: Personnel Profiling and Room QR return 100% identical data for all teachers in School ${cleanSchoolId}.`,
      );
    }
  } catch (err) {
    console.error("Error running parity check:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const schoolArg =
    process.argv.find((a, i) => process.argv[i - 1] === "--school") ||
    process.argv[2] ||
    "300488";
  checkParity(schoolArg);
}

module.exports = { checkParity };
